import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";
import { formatCents } from "../lib/admin/money";
import { sellUnitCents } from "../lib/dc/money";
import { parseDealerCopy } from "../lib/dc/parse";
import type { DcQuote } from "../lib/dc/types";
import { formatProjectNo } from "../lib/portal/project-no";
import { business } from "../content/business";
import { pdfText } from "./fixtures/pdf-text";
import { pdfPages } from "./fixtures/pdf-pages";
import { signedEvent, startStripeStub, type StubSession } from "./fixtures/stripe-stub";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run the Direct Connect quote tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const STAMP = Date.now();
const NAME = `E2E DC ${STAMP}`;
const OWNER = "e2e-dc-owner@example.com";
// One email per job, so each customer lands straight on their own project page.
const CUSTOMER = `e2e-dc-${STAMP}@example.com`;
// The release gate's other side: a different customer whose quoted job must not move.
const BYSTANDER = `e2e-dc-bystander-${STAMP}@example.com`;
// The payment paths on seeded Signed jobs each get their own customer.
const CARD_CUSTOMER = `e2e-dc-card-${STAMP}@example.com`;
const PAY_CUSTOMER = `e2e-dc-pay-${STAMP}@example.com`;
const REFUND_CUSTOMER = `e2e-dc-refund-${STAMP}@example.com`;
const MESSAGE_ID = `e2e-dc-${STAMP}`;

// The markups the owner types in Settings. Global rows, so they are snapshotted and restored.
const MARKUPS: Record<string, number> = { Duette: 60, Silhouette: 55.5, "Palm Beach Shutters": 70, Motorization: 100 };
const COLLECTIONS = Object.keys(MARKUPS).map((c) => c.toLowerCase());
const INSTALL_CENTS = 35_000;
const FIXTURE = path.join(__dirname, "..", "tests", "fixtures", "dc", "dealer-copy-4-lines.html");

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function signInOwner(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

/** Every context customerPage opens, closed in afterAll. */
const contexts: BrowserContext[] = [];

async function customerPage(browser: Browser, email: string): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`/project/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/project$/);
  return page;
}

/**
 * Fetches a file with the customer's own session, from inside the page: the session cookie is
 * `Secure`, so page.request would arrive signed out and read a sign-in page as a 200. See
 * portal.spec.ts's download() for the whole story.
 */
async function download(page: Page, target: string): Promise<{ status: number; html: boolean }> {
  return page.evaluate(async (href) => {
    const response = await fetch(href, { redirect: "manual" });
    const body = response.type === "opaqueredirect" ? "" : (await response.text()).slice(0, 200);
    return { status: response.status, html: /^\s*<(!doctype|html)/i.test(body) };
  }, target);
}

/** A file's bytes, fetched with the page's own session (the cookie is Secure, see download()). */
async function fetchBytes(page: Page, target: string): Promise<Buffer> {
  const base64 = await page.evaluate(async (href) => {
    const buffer = new Uint8Array(await (await fetch(href)).arrayBuffer());
    let binary = "";
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, target);
  return Buffer.from(base64, "base64");
}
const isHand = (font: string) => !font.startsWith("Helvetica");

async function lead(name: string, email: string, status: string): Promise<{ id: string; projectNo: number }> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550160', ${email}, 'Henderson', 'phone', ${status}) returning id, project_no`;
  return { id: row.id as string, projectNo: Number(row.project_no) };
}

/** A Signed job with a signed DC version at `totalCents`, as signing leaves one. The Dealer Copy row has no blob. */
async function seedSigned(name: string, email: string, totalCents: number): Promise<{ id: string; projectNo: number; versionId: string }> {
  const seeded = await lead(name, email, "signed");
  await sql()`update leads set sold_cents = ${totalCents} where id = ${seeded.id}`;
  const [file] = await sql()`insert into job_files (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${seeded.id}, 'Direct Connect', 'document', 'DEALER COPY seeded.html', 'text/html', 1,
            ${`e2e/${seeded.id}/seeded-${STAMP}.html`}, 'dealer_copy') returning id`;
  const versionId = randomUUID();
  await sql()`insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
      dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents, client_total_cents, products_cents, install_cents, signed_at)
    values (${versionId}, ${seeded.id}, 1, ${`E2E${STAMP}`}, ${formatProjectNo(seeded.projectNo)}, ${file.id}, ${"0".repeat(64)}, 'signed',
            1, 0, 0, 1, ${totalCents}, ${totalCents}, 0, now())`;
  return { ...seeded, versionId };
}

/**
 * What importDealerCopy would store, without its blob write: the Dealer Copy's job_files row
 * (a pathname this test never reads), then importVersion's own statement — the message record,
 * version 1 as a draft, its lines and the timeline event.
 */
async function seedImport(jobId: string, html: string, quote: DcQuote): Promise<string> {
  const [file] = await sql()`insert into job_files
    (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${jobId}, 'Direct Connect', 'document', ${`DEALER COPY ${quote.quoteNo}.html`}, 'text/html',
            ${Buffer.byteLength(html)}, ${`e2e/${jobId}/dealer-copy-${STAMP}.html`}, 'dealer_copy')
    returning id`;
  const lines = JSON.stringify(quote.lines.map((l) => ({
    position: l.position, qty: l.qty, room: l.room, description: l.description, collection: l.collection,
    base_cents: l.baseCents, promotion_cents: l.promotionCents, options_cents: l.optionsCents,
    msrp_unit_cents: l.msrpUnitCents, cost_factor: l.costFactor, cost_unit_cents: l.costUnitCents,
    cost_extended_cents: l.costExtendedCents, options: l.options,
  })));
  const sha256 = createHash("sha256").update(html).digest("hex");
  const rows = await sql()`
    with msg as (
      insert into ingested_messages (message_id, received_at, outcome, lead_id, dc_quote_no)
      values (${MESSAGE_ID}, now(), 'imported', ${jobId}, ${quote.quoteNo})
      on conflict (message_id) do nothing
      returning message_id
    ),
    version as (
      insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256,
        message_id, status, dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, ${jobId},
        coalesce((select max(version) from dc_quote_versions where lead_id = ${jobId}), 0) + 1,
        ${quote.quoteNo}, ${quote.poReference}, ${file.id}, ${sha256}, msg.message_id, 'draft',
        ${quote.subtotalCents}, ${quote.handlingFeeCents}, ${quote.oversizedFeeCents}, ${quote.dealerTotalCents}
      from msg
      returning id, lead_id, version
    ),
    inserted as (
      insert into dc_quote_lines (version_id, position, qty, room, description, collection, base_cents, promotion_cents,
        options_cents, msrp_unit_cents, cost_factor, cost_unit_cents, cost_extended_cents, options)
      select version.id, l.position, l.qty, l.room, l.description, l.collection, l.base_cents, l.promotion_cents,
        l.options_cents, l.msrp_unit_cents, l.cost_factor, l.cost_unit_cents, l.cost_extended_cents, l.options
      from version, jsonb_to_recordset(${lines}::jsonb) as l(position int, qty int, room text, description text,
        collection text, base_cents int, promotion_cents int, options_cents int, msrp_unit_cents int,
        cost_factor numeric, cost_unit_cents int, cost_extended_cents int, options jsonb)
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, 'Direct Connect', 'quote', ${`Direct Connect quote ${quote.quoteNo} arrived as version `} || version from version
    )
    select id from version`;
  return rows[0].id as string;
}

/** The figure beside one label in the review's totals. */
const figure = (review: Locator, label: string) =>
  review.locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::div/dd`);

/** The stage badge beside the job's name in the header: the one with the stage icon, not the PSS number before it. */
const stageBadge = (page: Page) =>
  page.locator("h1", { hasText: NAME }).first().locator("xpath=following-sibling::span[.//*[local-name()='svg']][1]");

const quoteTab = async (page: Page, jobId: string) => {
  await page.goto(`/admin/jobs/${jobId}?tab=quote`);
  const review = page.getByRole("region", { name: /^DC quote / });
  await expect(review).toBeVisible();
  return review;
};

let job: { id: string; projectNo: number };
let bystander: { id: string; projectNo: number };
let quote: DcQuote;
let versionId: string;
let savedRules: { collection: string; pct_of_msrp: string; updated_by: string | null; updated_at: string }[] = [];
let savedTerms: { terms_file_pathname: string | null; terms_updated_by: string | null; terms_updated_at: string | null } | null = null;
let savedTermsTemplates: string[] = [];
let expectedProducts: number;
let expectedTotal: number;

/** The local Stripe (e2e/fixtures/stripe-stub.ts) the app server talks to through STRIPE_API_URL. */
let stub: Awaited<ReturnType<typeof startStripeStub>>;

/** Posts a Stripe event for `session` to the webhook, signed with the e2e secret as Stripe signs one. */
const webhook = async (request: APIRequestContext, type: string, session: StubSession) => {
  const event = signedEvent(type, session);
  return request.post("/api/stripe/webhook", { data: event.body, headers: { "stripe-signature": event.signature, "content-type": "application/json" } });
};

test.beforeAll(async () => {
  if (!url) return;
  stub = await startStripeStub();
  // Markups and terms are one global row set. Snapshot them, then start from none, so the
  // blockers below are this run's and the owner's Settings steps are what price the quote.
  savedRules = (await sql()`select collection, pct_of_msrp, updated_by, updated_at from markup_rules
    where lower(collection) = any(${COLLECTIONS})`) as typeof savedRules;
  [savedTerms] = (await sql()`select terms_file_pathname, terms_updated_by, terms_updated_at from dc_settings where id`) as typeof savedTerms[];
  await sql()`delete from markup_rules where lower(collection) = any(${COLLECTIONS})`;
  await sql()`update dc_settings set terms_file_pathname = null, terms_updated_by = null, terms_updated_at = null where id`;
  // The terms template is one live row across the whole database: set any aside for the run.
  savedTermsTemplates = (await sql()`select id from document_templates where archived_at is null and kind = 'terms'`).map((r) => r.id as string);
  if (savedTermsTemplates.length > 0) await sql()`update document_templates set archived_at = now() where id = any(${savedTermsTemplates})`;

  job = await lead(`${NAME} A`, CUSTOMER, "visit_booked");
  bystander = await lead(`${NAME} B`, BYSTANDER, "quoted");

  // The 4-line fixture, its PO rewritten to this job's PSS number as the owner types it into DC.
  const html = readFileSync(FIXTURE, "utf8").replace("PSS-1042", formatProjectNo(job.projectNo)!);
  const parsed = parseDealerCopy(html);
  if (!parsed.ok) throw new Error(`The fixture did not parse: ${parsed.refusal.detail}`);
  quote = parsed.quote;
  expect(quote.projectNo).toBe(job.projectNo);
  expect(quote.lines).toHaveLength(4);
  versionId = await seedImport(job.id, html, quote);

  // The expected money, derived from the fixture's own cents with the app's rounding rule.
  expectedProducts = quote.lines.reduce((sum, l) => {
    const pct = MARKUPS[l.collection];
    if (pct === undefined) throw new Error(`No test markup for ${l.collection}`);
    return sum + sellUnitCents(l.msrpUnitCents, pct) * l.qty;
  }, 0);
  expectedTotal = expectedProducts + quote.handlingFeeCents + quote.oversizedFeeCents + INSTALL_CENTS;
  // The fee under test must be real, or "waive lowers the total by the fee" proves nothing.
  expect(quote.handlingFeeCents).toBeGreaterThan(0);
});

test.afterAll(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
  await stub?.close();
  if (!url) return;
  // Blobs this run created (a contract, its stamped copy, the terms). The seeded Dealer Copy has none.
  const token = process.env.E2E_BLOB_READ_WRITE_TOKEN;
  if (token) {
    const files = await sql()`select blob_pathname from job_files
      where lead_id in (select id from leads where name like 'E2E DC %') and doc_type is distinct from 'dealer_copy'`;
    const [terms] = await sql()`select terms_file_pathname from dc_settings where id`;
    const paths = files.map((f) => f.blob_pathname as string);
    if (terms?.terms_file_pathname && terms.terms_file_pathname !== savedTerms?.terms_file_pathname) paths.push(terms.terms_file_pathname as string);
    if (paths.length > 0) await del(paths, { token }).catch((error) => console.error("Could not remove e2e blobs", error));
  }
  // A signature references its files; a version references its files and its install price; a deposit its version.
  await sql()`delete from deposits where lead_id in (select id from leads where name like 'E2E DC %')`;
  await sql()`delete from contract_signatures where lead_id in (select id from leads where name like 'E2E DC %')`;
  await sql()`delete from dc_quote_versions where lead_id in (select id from leads where name like 'E2E DC %')`;
  await sql()`delete from ingested_messages where message_id like 'e2e-dc-%'`;
  await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E DC %')`;
  await sql()`delete from job_events where lead_id in (select id from leads where name like 'E2E DC %')`;
  await sql()`delete from leads where name like 'E2E DC %'`;
  await sql()`delete from customer_login_tokens where email like 'e2e-dc-%'`;
  await sql()`delete from customer_sessions where email like 'e2e-dc-%'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;

  // Settings go back exactly as they were found.
  await sql()`delete from markup_rules where lower(collection) = any(${COLLECTIONS})`;
  for (const r of savedRules) {
    await sql()`insert into markup_rules (collection, pct_of_msrp, updated_by, updated_at)
      values (${r.collection}, ${r.pct_of_msrp}, ${r.updated_by}, ${r.updated_at})`;
  }
  if (savedTerms) {
    await sql()`update dc_settings set terms_file_pathname = ${savedTerms.terms_file_pathname},
      terms_updated_by = ${savedTerms.terms_updated_by}, terms_updated_at = ${savedTerms.terms_updated_at} where id`;
  }
  await sql()`delete from document_templates where created_by = ${OWNER} and kind = 'terms'`;
  if (savedTermsTemplates.length > 0) await sql()`update document_templates set archived_at = null where id = any(${savedTermsTemplates})`;
});

test("an imported quote shows its four lines and can't be sent until markups, an install price and terms exist", async ({ page }) => {
  await signInOwner(page);
  const review = await quoteTab(page, job.id);

  await expect(review.getByRole("heading", { name: `DC quote ${quote.quoteNo} · version 1` })).toBeVisible();
  await expect(review.getByText("Draft", { exact: true })).toBeVisible();
  const rows = review.locator("tbody tr");
  await expect(rows).toHaveCount(4);
  for (const [i, room] of ["Living Room", "Primary Bedroom", "Kitchen", "Accessory"].entries()) {
    await expect(rows.nth(i).getByRole("rowheader")).toHaveText(room);
  }

  const blockers = review.getByRole("list", { name: "Before you can send" });
  for (const name of Object.keys(MARKUPS)) {
    await expect(blockers.getByText(`Set a markup for ${name} first.`, { exact: true })).toBeVisible();
  }
  await expect(blockers.getByText("Save an installation price, or tick No installation.")).toBeVisible();
  await expect(blockers.getByText("Add your contract terms on the Documents page first.")).toBeVisible();
  await expect(figure(review, "Client total")).toHaveText("—");
  await expect(review.getByRole("button", { name: "Send quote" })).toBeDisabled();
});

test("markups set in Settings and a final install price give the total computed from the fixture", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/admin/settings");
  const markup = page.getByRole("region", { name: "Markup by product line" });
  for (const [collection, pct] of Object.entries(MARKUPS)) {
    const row = markup.locator("form").filter({ has: page.getByLabel(`${collection} % of MSRP`, { exact: true }) });
    await row.getByLabel(`${collection} % of MSRP`, { exact: true }).fill(String(pct));
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("status")).toHaveText("Saved.");
  }
  const stored = await sql()`select collection, pct_of_msrp from markup_rules where lower(collection) = any(${COLLECTIONS}) order by collection`;
  expect(Object.fromEntries(stored.map((r) => [r.collection, Number(r.pct_of_msrp)]))).toEqual(MARKUPS);

  // A final install price, stored as the Install tab stores one. Seeded rather than typed: the
  // Install tab prices from global install rates, which install.spec.ts wipes before and after
  // itself, so typing one here would race that spec whenever the two files run in parallel.
  await sql()`insert into install_quotes (lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
    values (${job.id}, 'final', 0, ${INSTALL_CENTS}, ${INSTALL_CENTS}, ${OWNER})`;

  const review = await quoteTab(page, job.id);
  const rows = review.locator("tbody tr");
  for (const [i, line] of quote.lines.entries()) {
    const extended = sellUnitCents(line.msrpUnitCents, MARKUPS[line.collection]) * line.qty;
    await expect(rows.nth(i).getByLabel(`Line ${line.position} % of MSRP`)).toHaveValue(String(MARKUPS[line.collection]));
    await expect(rows.nth(i)).toContainText(formatCents(extended));
  }
  await expect(figure(review, "Products")).toHaveText(formatCents(expectedProducts));
  await expect(figure(review, "HD handling fee")).toHaveText(formatCents(quote.handlingFeeCents));
  await expect(figure(review, "Installation")).toHaveText(formatCents(INSTALL_CENTS));
  await expect(figure(review, "Client total")).toHaveText(formatCents(expectedTotal));
  await expect(review.getByText(/^Final install price, /)).toBeVisible();

  // Only the terms are still missing.
  const blockers = review.getByRole("list", { name: "Before you can send" }).getByRole("listitem");
  await expect(blockers).toHaveCount(1);
  await expect(blockers).toHaveText("Add your contract terms on the Documents page first.");
  await expect(review.getByRole("button", { name: "Send quote" })).toBeDisabled();
});

test("waiving the handling fee lowers the total by exactly the fixture's fee", async ({ page }) => {
  await signInOwner(page);
  const review = await quoteTab(page, job.id);
  await expect(figure(review, "Client total")).toHaveText(formatCents(expectedTotal));

  await review.getByRole("checkbox", { name: "Waive", exact: true }).check();
  await expect(figure(review, "HD handling fee")).toHaveText(formatCents(0));
  await expect(figure(review, "Client total")).toHaveText(formatCents(expectedTotal - quote.handlingFeeCents));

  // Stored, not just drawn: a reload shows the same.
  await expect.poll(async () => {
    const [row] = await sql()`select waive_handling from dc_quote_versions where id = ${versionId}`;
    return row.waive_handling;
  }).toBe(true);
  const reloaded = await quoteTab(page, job.id);
  await expect(reloaded.getByRole("checkbox", { name: "Waive", exact: true })).toBeChecked();
  await expect(figure(reloaded, "Client total")).toHaveText(formatCents(expectedTotal - quote.handlingFeeCents));
});

/**
 * The client pays the 50% deposit by card on a Signed job: one Checkout Session however often they tap
 * Pay, "Processing" until the verified webhook lands, then Sold with one payment and one stage event; a
 * duplicate delivery and a late expiry change nothing, and a forged body is refused.
 */
async function payDepositByCard({ page, browser, request, target, email }: {
  page: Page; browser: Browser; request: APIRequestContext;
  target: { id: string; projectNo: number; totalCents: number }; email: string;
}): Promise<void> {
  const deposit = Math.round(target.totalCents / 2);
  const customer = await customerPage(browser, email);
  // The app's own origin (127.0.0.1 and the e2e port): the success URL must bring the client back to it.
  const origin = new URL(customer.url()).origin;
  expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  await expect(customer.getByRole("heading", { name: "Deposit" })).toBeVisible();
  await customer.getByRole("button", { name: `Pay 50% deposit — ${formatCents(deposit)}` }).click();
  await expect(customer).toHaveURL(/^http:\/\/127\.0\.0\.1:3198\/pay\/cs_test_e2e_/);
  const sent = stub.creates.at(-1)!;
  expect(sent.get("line_items[0][price_data][unit_amount]")).toBe(String(deposit));
  expect(sent.get("line_items[0][price_data][product_data][name]")).toBe(`50% deposit — ${formatProjectNo(target.projectNo)}`);
  expect(sent.get("customer_email")).toBe(email);
  expect(sent.get("success_url")).toBe(`${origin}/project/${target.id}?deposit=done`);
  const [pending] = await sql()`select id, status, amount_cents, stripe_session_id from deposits where lead_id = ${target.id}`;
  expect(pending).toMatchObject({ status: "pending", amount_cents: deposit, id: sent.get("metadata[depositId]") });

  // Back on the page before paying: Pay again lands on the same session (Review Focus 2).
  await customer.goto(`/project/${target.id}`);
  await customer.getByRole("button", { name: `Pay 50% deposit — ${formatCents(deposit)}` }).click();
  await expect(customer).toHaveURL(new RegExp(`/pay/${pending.stripe_session_id}$`));
  expect(await sql()`select id from deposits where lead_id = ${target.id}`).toHaveLength(1);

  // The redirect alone proves nothing: before the webhook, the page says Processing.
  await customer.goto(`/project/${target.id}?deposit=done`);
  await expect(customer.getByText("Processing — we will email your receipt as soon as your payment is confirmed.")).toBeVisible();

  const paid = stub.complete(pending.stripe_session_id as string);
  expect((await webhook(request, "checkout.session.completed", paid)).status()).toBe(200);
  const [row] = await sql()`select method, status, amount_cents, recorded_by, stripe_session_id, stripe_payment_intent_id,
      (paid_at is not null) as paid, (refunded_at is not null) as refunded from deposits where lead_id = ${target.id}`;
  expect(row).toEqual({ method: "stripe", status: "paid", amount_cents: deposit, recorded_by: null,
    stripe_session_id: paid.id, stripe_payment_intent_id: paid.paymentIntent, paid: true, refunded: false });
  const [job] = await sql()`select status, sold_cents, deposit_cents from leads where id = ${target.id}`;
  expect(job).toEqual({ status: "sold", sold_cents: target.totalCents, deposit_cents: deposit });
  const paymentEvents = await sql()`select actor, kind, from_status, to_status, body from job_events
    where lead_id = ${target.id} and (kind = 'payment' or (kind = 'stage' and to_status = 'sold')) order by kind`;
  expect(paymentEvents).toEqual([
    { actor: "Stripe", kind: "payment", from_status: null, to_status: null, body: `Deposit ${formatCents(deposit)} paid by card` },
    { actor: "Stripe", kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit paid" },
  ]);

  // Stripe delivers again, and an expiry arrives late: nothing changes (Review Focus 1).
  expect((await webhook(request, "checkout.session.completed", paid)).status()).toBe(200);
  expect((await webhook(request, "checkout.session.expired", paid)).status()).toBe(200);
  expect(await sql()`select status from deposits where lead_id = ${target.id}`).toEqual([{ status: "paid" }]);
  expect(await sql()`select id from job_events where lead_id = ${target.id} and kind = 'payment'`).toHaveLength(1);
  // A body that does not verify is refused.
  const forged = await request.post("/api/stripe/webhook", { data: signedEvent("checkout.session.completed", paid).body,
    headers: { "stripe-signature": "t=1,v1=deadbeef", "content-type": "application/json" } });
  expect(forged.status()).toBe(400);

  await customer.goto(`/project/${target.id}?deposit=done`);
  await expect(customer.getByText("Payment received — thank you.")).toBeVisible();
  await expect(customer.getByRole("button", { name: /Pay 50% deposit/ })).toHaveCount(0);

  await signInOwner(page);
  await page.goto(`/admin/jobs/${target.id}?tab=quote`);
  await expect(stageBadge(page)).toHaveText("Sold");
  await expect(page.getByRole("region", { name: "Deposit" })).toContainText(`Deposit ${formatCents(deposit)} paid by card on`);
}

/** Confirming a measure appointment on a Sold job moves it to Official measure (spec §5). */
async function confirmMeasure(page: Page, target: { id: string; totalCents: number }): Promise<void> {
  await signInOwner(page);
  await page.goto(`/admin/jobs/${target.id}`);
  const card = page.getByRole("region", { name: "Appointments" });
  await card.getByRole("button", { name: "Schedule" }).click();
  const modal = page.getByRole("dialog", { name: "Schedule" });
  await modal.getByLabel("Date and time").fill("2027-01-12T10:00");
  await modal.getByRole("radio", { name: "Measure" }).check();
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await card.getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(stageBadge(page)).toHaveText("Official measure");
  const [row] = await sql()`select status, sold_cents, deposit_cents from leads where id = ${target.id}`;
  expect(row).toEqual({ status: "measure", sold_cents: target.totalCents, deposit_cents: Math.round(target.totalCents / 2) });
  const [stage] = await sql()`select from_status, to_status, body from job_events where lead_id = ${target.id} and kind = 'stage' order by created_at desc limit 1`;
  expect(stage).toEqual({ from_status: "sold", to_status: "measure", body: "Measure appointment confirmed" });
}

// Seeded Signed jobs: no PDF is built or stored, so these run without a blob store. They come before the
// Blob-backed flow below, which fails loudly without a token (and serial mode skips whatever follows it).
test.describe("the deposit on a Signed job — by card, by hand, and cancelled", () => {
  // 184833 halves to 92416.5: the deposit rounds the half cent up, to 92417.
  let card: { id: string; projectNo: number; versionId: string; totalCents: number };

  test("the customer pays the deposit by card: one session, a verified webhook, Sold, and a duplicate delivery changes nothing", async ({ page, browser, request }) => {
    card = { ...(await seedSigned(`${NAME} Card`, CARD_CUSTOMER, 184_833)), totalCents: 184_833 };
    await payDepositByCard({ page, browser, request, target: card, email: CARD_CUSTOMER });
    const [row] = await sql()`select amount_cents from deposits where lead_id = ${card.id}`;
    expect(row.amount_cents).toBe(92_417);
  });

  test("confirming the measure appointment moves the Sold job to Official measure", async ({ page }) => {
    await confirmMeasure(page, card);
  });

  test("Payment received closes the client's open card checkout, records the check, and a late card payment is not recorded twice", async ({ page, browser, request }) => {
    const seeded = await seedSigned(`${NAME} Pay`, PAY_CUSTOMER, 250_001);
    const customer = await customerPage(browser, PAY_CUSTOMER);
    await customer.getByRole("button", { name: `Pay 50% deposit — ${formatCents(125_001)}` }).click();
    await expect(customer).toHaveURL(/\/pay\/cs_test_e2e_/);
    const [pending] = await sql()`select stripe_session_id from deposits where lead_id = ${seeded.id} and status = 'pending'`;
    expect(stub.sessions.get(pending.stripe_session_id as string)?.status).toBe("open");

    await signInOwner(page);
    await page.goto(`/admin/jobs/${seeded.id}?tab=quote`);
    const panel = page.getByRole("region", { name: "Deposit" });
    await expect(panel).toContainText(`50% deposit due: ${formatCents(125_001)} of ${formatCents(250_001)}. The client has opened card checkout.`);
    await panel.getByRole("button", { name: "Payment received" }).click();
    await expect(panel.getByLabel("Deposit received")).toHaveValue("1250.01");
    await panel.getByLabel("Deposit received").fill("1250.00");
    await panel.getByLabel("Paid by").selectOption("check");
    await panel.getByRole("button", { name: "Record payment" }).click();
    await expect(panel.getByRole("status")).toHaveText("Deposit recorded. The job is Sold.");
    expect(stub.sessions.get(pending.stripe_session_id as string)?.status).toBe("expired");

    const rows = await sql()`select method, status, amount_cents, recorded_by, stripe_session_id, stripe_payment_intent_id,
        (paid_at is not null) as paid, (refunded_at is not null) as refunded from deposits where lead_id = ${seeded.id} order by method`;
    expect(rows).toEqual([
      { method: "check", status: "paid", amount_cents: 125_000, recorded_by: OWNER, stripe_session_id: null, stripe_payment_intent_id: null, paid: true, refunded: false },
      { method: "stripe", status: "expired", amount_cents: 125_001, recorded_by: null, stripe_session_id: pending.stripe_session_id, stripe_payment_intent_id: null, paid: false, refunded: false },
    ]);
    const [row] = await sql()`select status, sold_cents, deposit_cents from leads where id = ${seeded.id}`;
    expect(row).toEqual({ status: "sold", sold_cents: 250_001, deposit_cents: 125_000 });
    const events = await sql()`select actor, kind, from_status, to_status, body from job_events where lead_id = ${seeded.id} and kind in ('payment','stage') order by kind`;
    expect(events).toEqual([
      { actor: OWNER, kind: "payment", from_status: null, to_status: null, body: "Deposit $1,250 received by check" },
      { actor: OWNER, kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit recorded" },
    ]);

    // Review Focus 3: the card payment completes anyway. It is not recorded as a second deposit.
    const late = stub.complete(pending.stripe_session_id as string);
    expect((await webhook(request, "checkout.session.completed", late)).status()).toBe(200);
    expect(await sql()`select id from deposits where lead_id = ${seeded.id} and status = 'paid'`).toHaveLength(1);
    const [after] = await sql()`select status, deposit_cents from leads where id = ${seeded.id}`;
    expect(after).toEqual({ status: "sold", deposit_cents: 125_000 });
  });

  test("Cancel & refund refunds the card in full through Stripe, cancels the contract and loses the job", async ({ page }) => {
    const seeded = await seedSigned(`${NAME} Refund`, REFUND_CUSTOMER, 300_000);
    const depositId = randomUUID();
    await sql()`insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status, stripe_session_id, stripe_payment_intent_id, paid_at)
      values (${depositId}, ${seeded.id}, ${seeded.versionId}, 150000, 'stripe', 'paid', ${`cs_seeded_${STAMP}`}, ${`pi_seeded_${STAMP}`}, now())`;
    await sql()`update leads set status = 'sold', deposit_cents = 150000 where id = ${seeded.id}`;

    await signInOwner(page);
    await page.goto(`/admin/jobs/${seeded.id}?tab=quote`);
    const panel = page.getByRole("region", { name: "Deposit" });
    await expect(panel).toContainText("Deposit $1,500 paid by card on");
    await panel.getByRole("button", { name: "Cancel & refund" }).click();
    await expect(panel.getByText(/^The client is inside the 3-business-day cancellation window, which ends at the end of /)).toBeVisible();
    await panel.getByRole("button", { name: "Yes, cancel and refund" }).click();
    await expect(panel.getByRole("status")).toHaveText("Cancelled and refunded. The job is Lost.");

    expect(stub.refunds).toContainEqual({ paymentIntent: `pi_seeded_${STAMP}`, idempotencyKey: `refund-${depositId}` });
    const [stored] = await sql()`select status, amount_cents, (refunded_at is not null) as refunded from deposits where id = ${depositId}`;
    expect(stored).toEqual({ status: "refunded", amount_cents: 150000, refunded: true });
    const [version] = await sql()`select status, (cancelled_at is not null) as cancelled from dc_quote_versions where id = ${seeded.versionId}`;
    expect(version).toEqual({ status: "cancelled", cancelled: true });
    const [row] = await sql()`select status, sold_cents, deposit_cents, lost_reason from leads where id = ${seeded.id}`;
    expect(row).toEqual({ status: "lost", sold_cents: 300000, deposit_cents: null, lost_reason: "Cancelled — deposit refunded" });
    const events = await sql()`select actor, kind, from_status, to_status, body from job_events where lead_id = ${seeded.id} and kind in ('payment','stage') order by kind`;
    expect(events).toEqual([
      { actor: OWNER, kind: "payment", from_status: null, to_status: null, body: "Deposit $1,500 refunded to the client's card" },
      { actor: OWNER, kind: "stage", from_status: "sold", to_status: "lost", body: "Cancelled — deposit refunded" },
    ]);
  });
});

test.describe("quote, approve, sign, deposit, measure — and the release gate", () => {
  // Sending builds PDFs from the terms in Blob and stores them there, and signing fingerprints the stored
  // bytes, so this needs a real blob store. A missing token fails loudly rather than skipping.
  test.beforeAll(() => {
    if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "E2E_BLOB_READ_WRITE_TOKEN is not set. Send, sign and the release gate must actually run — " +
          "set the token against the test blob store rather than skipping them.",
      );
    }
  });

  const waivedTotal = () => expectedTotal - quote.handlingFeeCents;
  const deposit = () => Math.round(waivedTotal() / 2);
  const quoteName = () => `Quote ${formatProjectNo(job.projectNo)} v1.pdf`;
  const contractName = () => `Contract ${formatProjectNo(job.projectNo)} v1.pdf`;
  let quoteFileId = "";

  test("with the starter terms, Send quote shares the reviewed total as a quote, with no contract yet, and the job moves to Quoted", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/admin/documents");
    await page.getByRole("button", { name: "Start from the Premier Shade starter terms" }).click();
    await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/);
    const terms = page.getByLabel("Text");
    const [banner, ...rest] = (await terms.inputValue()).split("\n");
    expect(banner).toMatch(/^\*\*DRAFT:/);
    await terms.fill(rest.join("\n").trimStart());
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    const review = await quoteTab(page, job.id);
    await expect(review.getByRole("list", { name: "Before you can send" })).toHaveCount(0);
    await expect(stageBadge(page)).toHaveText("Appointment booked");
    await review.getByRole("button", { name: "Send quote" }).click();
    // Resend is not configured in e2e, so the quote is sent and the email is reported failed.
    await expect(review.getByRole("status")).toHaveText(
      "Quote sent, but the email to the client failed — send them their project page link yourself.",
    );

    const [version] = await sql()`select status, client_total_cents, products_cents, install_cents, quote_file_id, contract_file_id,
        offered_by, (offered_at is not null) as offered, approved_at from dc_quote_versions where id = ${versionId}`;
    expect(version).toEqual({ status: "offered", client_total_cents: waivedTotal(), products_cents: expectedProducts,
      install_cents: INSTALL_CENTS, quote_file_id: expect.any(String), contract_file_id: null, offered_by: OWNER, offered: true, approved_at: null });
    quoteFileId = version.quote_file_id as string;
    const [row] = await sql()`select status, quote_cents, sold_cents, deposit_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "quoted", quote_cents: waivedTotal(), sold_cents: null, deposit_cents: null });
    const [file] = await sql()`select name, doc_type, (shared_at is not null) as shared from job_files where id = ${quoteFileId}`;
    expect(file).toEqual({ name: quoteName(), doc_type: "quote", shared: true });
    expect(await sql()`select id from job_files where lead_id = ${job.id} and doc_type = 'contract'`).toHaveLength(0);

    const printed = pdfText(await fetchBytes(page, `/admin/files/${quoteFileId}`));
    expect(printed).toContain(`Quote ${formatProjectNo(job.projectNo)} · Version 1`);
    expect(printed).toContain(formatCents(waivedTotal()));
    expect(printed).not.toContain("Terms and Conditions");
    expect(printed).not.toContain("Client signature");
    await page.reload();
    await expect(stageBadge(page)).toHaveText("Quoted");
  });

  test("the customer approves, and the contract goes out at the same total and prints the terms", async ({ browser }) => {
    const customer = await customerPage(browser, CUSTOMER);
    const banner = customer.getByRole("region", { name: "Where your project stands" });
    await expect(banner.getByRole("link", { name: "Review quote" })).toHaveAttribute("href", `/project/files/${quoteFileId}`);
    await banner.getByText("Approve this quote", { exact: true }).click();
    await expect(banner.getByText("Approving accepts this quote. Your contract comes next, to read and sign.")).toBeVisible();
    await banner.getByRole("button", { name: "Yes, approve this quote" }).click();
    await expect(customer).toHaveURL(new RegExp(`/project/${job.id}\\?approved=1$`));
    await expect(customer.getByRole("status")).toContainText("Thank you — we have your approval");
    await expect(customer.getByRole("heading", { name: "Documents to sign" })).toBeVisible();
    await expect(customer.getByText("Approve this quote", { exact: true })).toHaveCount(0);

    const [version] = await sql()`select status, client_total_cents, products_cents, install_cents, quote_file_id, contract_file_id,
        offered_by, approved_by, sent_by, (approved_at is not null) as approved from dc_quote_versions where id = ${versionId}`;
    expect(version).toEqual({ status: "sent", client_total_cents: waivedTotal(), products_cents: expectedProducts, install_cents: INSTALL_CENTS,
      quote_file_id: quoteFileId, contract_file_id: expect.any(String), offered_by: OWNER, approved_by: CUSTOMER,
      sent_by: "Sent on approval", approved: true });
    const [row] = await sql()`select status, quote_cents, sold_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "approved", quote_cents: waivedTotal(), sold_cents: null });
    const stages = await sql()`select from_status, to_status, body, actor from job_events where lead_id = ${job.id} and kind = 'stage' order by created_at`;
    expect(stages).toEqual([
      { from_status: "visit_booked", to_status: "quoted", body: "Quote sent", actor: OWNER },
      { from_status: "quoted", to_status: "approved", body: "Approved quote version 1", actor: CUSTOMER },
    ]);
    const [file] = await sql()`select name, doc_type, (shared_at is not null) as shared, sign_marks is not null as marked
      from job_files where id = ${version.contract_file_id}`;
    expect(file).toEqual({ name: contractName(), doc_type: "contract", shared: true, marked: true });

    // The contract prints the terms template's text, fields filled.
    const drawn = pdfText(await fetchBytes(customer, `/project/files/${version.contract_file_id}`));
    expect(drawn).toContain("Terms and Conditions");
    expect(drawn).toContain("4. Your Right to Cancel");
    expect(drawn).toContain("18. Contact Us");
    expect(drawn).toContain(`Phone: ${business.phone.display}`);
    expect(drawn).toContain(formatCents(waivedTotal()));
    expect(drawn.join(" ")).not.toContain("{{");
  });

  test("the customer signs the contract, the owner sees Signed, and the order link waits for the cancellation window", async ({ page, browser }) => {
    const customer = await customerPage(browser, CUSTOMER);
    await expect(customer.getByRole("heading", { name: "Documents to sign" })).toBeVisible();
    // By text, not by role: the contract's link sits inside a CLOSED <details>, and role locators
    // skip elements hidden from the accessibility tree, so a role-based `has:` would match nothing.
    const details = customer.locator("details", { hasText: contractName() });
    await expect(details).toHaveCount(1);
    await details.locator("summary").click();
    const form = details.locator("form");
    // Before signing: the contract the client reads shows an empty initials box beside every
    // numbered section, and an empty signature block (spec §3).
    const [sent] = await sql()`select contract_file_id from dc_quote_versions where id = ${versionId}`;
    const unsigned = pdfText(await fetchBytes(customer, `/project/files/${sent.contract_file_id}`));
    const sections = unsigned.filter((text) => /^\d+\. /.test(text)).length;
    expect(sections).toBeGreaterThan(0);
    expect(unsigned.filter((text) => text === "Initials")).toHaveLength(sections);
    expect(unsigned).toContain("Client signature");
    await form.getByLabel("Your full name").fill("Pat Buyer");
    await form.getByLabel("Your initials").fill("PB");
    await form.getByLabel("I agree to sign this contract electronically and to initial every numbered section").check();
    await form.getByRole("button", { name: "Sign this contract" }).click();
    await expect(customer.getByRole("status")).toContainText("Thank you — your contract was signed on");
    await expect(customer.getByRole("heading", { name: "Documents to sign" })).toHaveCount(0);

    const [version] = await sql()`select status from dc_quote_versions where id = ${versionId}`;
    expect(version.status).toBe("signed");
    // The stamped copy is written in after(), once the response has gone. Wait for it, so it is
    // proven to exist and so afterAll's cleanup sees its row and removes its blob.
    await expect.poll(async () => {
      const [signature] = await sql()`select signed_file_id from contract_signatures where lead_id = ${job.id}`;
      return signature?.signed_file_id ?? null;
    }, { timeout: 20_000 }).not.toBeNull();
    const [adopted] = await sql()`select signature_method, signed_initials, signed_file_id from contract_signatures where lead_id = ${job.id}`;
    expect(adopted).toMatchObject({ signature_method: "typed", signed_initials: "PB" });
    const pages = await pdfPages(await fetchBytes(customer, `/project/files/${adopted.signed_file_id}`));
    const body = pages.slice(0, -1);
    const hand = body.flatMap((page) => page.runs.filter((run) => isHand(run.font)).map((run) => run.text));
    // The initials once per numbered section, and the signature once, in the handwriting font (spec §10).
    expect(hand.filter((text) => text === "PB")).toHaveLength(sections);
    expect(hand.filter((text) => text === "Pat Buyer")).toHaveLength(1);
    const blockPage = body.find((page) => page.runs.some((run) => run.text === "Client signature"))!;
    const typedRuns = blockPage.runs.filter((run) => !isHand(run.font)).map((run) => run.text);
    expect(typedRuns).toContain("Pat Buyer");
    expect(typedRuns.some((text) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(text))).toBe(true);
    const record = pages.at(-1)!.runs.map((run) => run.text).join("\n");
    expect(record).toContain("ELECTRONIC SIGNATURE");
    expect(record).toContain("Method:     typed");
    expect(record).toMatch(/Initialed sections: 1, 2, 3/);
    const [row] = await sql()`select status, sold_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "signed", sold_cents: waivedTotal() });

    await signInOwner(page);
    const review = await quoteTab(page, job.id);
    await expect(stageBadge(page)).toHaveText("Signed");
    const signedStages = await sql()`select from_status, to_status, body from job_events where lead_id = ${job.id} and kind = 'stage' order by created_at`;
    expect(signedStages.at(-1)).toEqual({ from_status: "approved", to_status: "signed", body: "Signed contract version 1" });
    await expect(page.getByRole("region", { name: "Deposit" })).toContainText(`50% deposit due: ${formatCents(deposit())} of ${formatCents(waivedTotal())}.`);
    await expect(review.getByRole("heading", { name: `DC quote ${quote.quoteNo} · version 1` })).toBeVisible();
    await expect(review.getByText("Signed", { exact: true })).toBeVisible();
    // Spec §9: just signed, the three-business-day cancellation window is still open, so the owner is
    // told when it ends and is not yet offered the order link.
    await expect(review.getByText(/^Signed [A-Z][a-z]{2} \d{1,2}, \d{4}\. Cancellation window ends at the end of .+ — place the Direct Connect order after that\.$/))
      .toBeVisible();
    await expect(review.getByRole("link", { name: /^Signed — ready to order/ })).toHaveCount(0);
    await expect(figure(review, "Client total")).toHaveText(formatCents(waivedTotal()));

    // Once the window has closed, the order link appears. Test branch only: the signature is moved
    // back three weeks, well past three business days whatever the holidays.
    await sql()`update dc_quote_versions set signed_at = signed_at - interval '21 days' where id = ${versionId}`;
    await sql()`update contract_signatures set signed_at = signed_at - interval '21 days' where lead_id = ${job.id}`;
    await page.reload();
    const closed = page.getByRole("region", { name: /^DC quote / });
    await expect(closed.getByRole("link", { name: `Signed — ready to order: Open quote ${quote.quoteNo} in Direct Connect` })).toBeVisible();
    await expect(closed.getByText(/Cancellation window ends/)).toHaveCount(0);
  });

  test("the customer pays the deposit by card: one session, a verified webhook, Sold, and a duplicate delivery changes nothing", async ({ page, browser, request }) => {
    await payDepositByCard({ page, browser, request, target: { ...job, totalCents: waivedTotal() }, email: CUSTOMER });
  });

  test("confirming the measure appointment moves the Sold job to Official measure", async ({ page }) => {
    await confirmMeasure(page, { id: job.id, totalCents: waivedTotal() });
  });

  test("gate: another customer's quoted job does not move and never sees this contract", async ({ browser }) => {
    const [version] = await sql()`select contract_file_id from dc_quote_versions where id = ${versionId}`;
    const other = await customerPage(browser, BYSTANDER);
    await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(other.getByRole("heading", { name: "Documents to sign" })).toHaveCount(0);
    await expect(other.locator("main")).not.toContainText(contractName());
    // Not a bounce to sign-in: the file route itself refuses a file that is not this customer's.
    const fetched = await download(other, `/project/files/${version.contract_file_id}`);
    expect(fetched).toEqual({ status: 404, html: false });

    const [row] = await sql()`select status, quote_cents, sold_cents from leads where id = ${bystander.id}`;
    expect(row).toEqual({ status: "quoted", quote_cents: null, sold_cents: null });
    expect(await sql()`select id from dc_quote_versions where lead_id = ${bystander.id}`).toHaveLength(0);
    expect(await sql()`select id from contract_signatures where lead_id = ${bystander.id}`).toHaveLength(0);
  });
});

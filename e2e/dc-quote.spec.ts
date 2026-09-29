import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatCents } from "../lib/admin/money";
import { sellUnitCents } from "../lib/dc/money";
import { parseDealerCopy } from "../lib/dc/parse";
import type { DcQuote } from "../lib/dc/types";
import { formatProjectNo } from "../lib/portal/project-no";

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

async function customerPage(browser: Browser, email: string): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  const page = await (await browser.newContext()).newPage();
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

async function lead(name: string, email: string, status: string): Promise<{ id: string; projectNo: number }> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550160', ${email}, 'Henderson', 'phone', ${status}) returning id, project_no`;
  return { id: row.id as string, projectNo: Number(row.project_no) };
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

/** A one-page terms PDF, made here rather than committed: only the send test uploads it. */
async function termsPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText("Terms and conditions (test)", { x: 72, y: 700, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await doc.save());
}

/** The figure beside one label in the review's totals. */
const figure = (review: Locator, label: string) =>
  review.locator(`xpath=.//dt[normalize-space()="${label}"]/following-sibling::div/dd`);

/** The stage badge beside the job's name in the header. */
const stageBadge = (page: Page) => page.locator("h1", { hasText: NAME }).first().locator("xpath=following-sibling::span[1]");

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
let expectedProducts: number;
let expectedTotal: number;

test.beforeAll(async () => {
  if (!url) return;
  // Markups and terms are one global row set. Snapshot them, then start from none, so the
  // blockers below are this run's and the owner's Settings steps are what price the quote.
  savedRules = (await sql()`select collection, pct_of_msrp, updated_by, updated_at from markup_rules
    where lower(collection) = any(${COLLECTIONS})`) as typeof savedRules;
  [savedTerms] = (await sql()`select terms_file_pathname, terms_updated_by, terms_updated_at from dc_settings where id`) as typeof savedTerms[];
  await sql()`delete from markup_rules where lower(collection) = any(${COLLECTIONS})`;
  await sql()`update dc_settings set terms_file_pathname = null, terms_updated_by = null, terms_updated_at = null where id`;

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
  // A signature references its files; a version references its files and its install price.
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
  await expect(review.getByRole("button", { name: "Send contract" })).toBeDisabled();
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
  await expect(review.getByRole("button", { name: "Send contract" })).toBeDisabled();
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

test.describe("send, sign and the release gate", () => {
  // Sending builds the contract from the terms PDF in Blob and stores the contract there, and
  // signing fingerprints the stored bytes, so everything below needs a real blob store. This is
  // the release gate: like portal.spec.ts's gates, a missing token fails loudly here rather than
  // skipping, because a gate that quietly does not run reads green while proving nothing.
  test.beforeAll(() => {
    if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "E2E_BLOB_READ_WRITE_TOKEN is not set. Send, sign and the release gate must actually run — " +
          "set the token against the test blob store rather than skipping them.",
      );
    }
  });

  const waivedTotal = () => expectedTotal - quote.handlingFeeCents;
  const contractName = () => `Contract ${formatProjectNo(job.projectNo)} v1.pdf`;

  test("with terms uploaded, Send contract sends the reviewed total and the job moves to Quoted", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/admin/settings");
    await page.getByLabel("Upload terms PDF").setInputFiles({ name: "terms.pdf", mimeType: "application/pdf", buffer: await termsPdf() });
    await expect(page.getByText(/^Terms last updated /)).toBeVisible();

    const review = await quoteTab(page, job.id);
    await expect(review.getByRole("list", { name: "Before you can send" })).toHaveCount(0);
    await expect(stageBadge(page)).toHaveText("Appointment booked");
    await review.getByRole("button", { name: "Send contract" }).click();
    // Resend is not configured in e2e, so the contract is sent and the email is reported failed.
    await expect(review.getByRole("status")).toHaveText(
      "Contract sent, but the email to the client failed — send them their project page link yourself.",
    );

    const [version] = await sql()`select status, client_total_cents, products_cents, install_cents, contract_file_id
      from dc_quote_versions where id = ${versionId}`;
    expect(version).toMatchObject({ status: "sent", client_total_cents: waivedTotal(), products_cents: expectedProducts, install_cents: INSTALL_CENTS });
    const [row] = await sql()`select status, quote_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "quoted", quote_cents: waivedTotal() });
    const [file] = await sql()`select name, doc_type, shared_at from job_files where id = ${version.contract_file_id}`;
    expect(file.name).toBe(contractName());
    expect(file.doc_type).toBe("contract");
    expect(file.shared_at).not.toBeNull();

    await page.reload();
    await expect(stageBadge(page)).toHaveText("Quoted");
  });

  test("the customer signs the contract, and the owner sees Sold and ready to order", async ({ page, browser }) => {
    const customer = await customerPage(browser, CUSTOMER);
    await expect(customer.getByRole("heading", { name: "Documents to sign" })).toBeVisible();
    // By text, not by role: the contract's link sits inside a CLOSED <details>, and role locators
    // skip elements hidden from the accessibility tree, so a role-based `has:` would match nothing.
    const details = customer.locator("details", { hasText: contractName() });
    await expect(details).toHaveCount(1);
    await details.locator("summary").click();
    const form = details.locator("form");
    await form.getByLabel("Your full name").fill("Pat Buyer");
    await form.getByLabel("I agree to sign this contract electronically").check();
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
    const [row] = await sql()`select status, sold_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "sold", sold_cents: waivedTotal() });

    await signInOwner(page);
    const review = await quoteTab(page, job.id);
    await expect(stageBadge(page)).toHaveText("Sold");
    await expect(review.getByRole("heading", { name: `DC quote ${quote.quoteNo} · version 1` })).toBeVisible();
    await expect(review.getByText("Signed", { exact: true })).toBeVisible();
    await expect(review.getByRole("link", { name: /^Signed — ready to order/ })).toBeVisible();
    await expect(figure(review, "Client total")).toHaveText(formatCents(waivedTotal()));
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

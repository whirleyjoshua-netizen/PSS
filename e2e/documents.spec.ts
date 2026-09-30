import { createHash, randomBytes } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";
import { winAnsiSafe } from "../lib/dc/contract-layout";
import { formatProjectNo } from "../lib/portal/project-no";
import { pdfText } from "./fixtures/pdf-text";
import { pdfPages } from "./fixtures/pdf-pages";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run the Documents tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const STAMP = Date.now();
const NAME = `E2E Docs ${STAMP}`;
const OWNER = "e2e-docs-owner@example.com";
const CUSTOMER = `e2e-docs-${STAMP}@example.com`;
const BYSTANDER = `e2e-docs-bystander-${STAMP}@example.com`;
const ACK_TEMPLATE = `E2E Agreement ${STAMP}`;
const SIGN_TEMPLATE = `E2E Change Order ${STAMP}`;
const DRAW_TEMPLATE = `E2E Service Agreement ${STAMP}`;
const EMAIL_FAILED = "Sent, but the email to the client failed — send them their project page link yourself.";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function signInOwner(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

/** Every context customerPage opens, closed in afterAll. */
const contexts: BrowserContext[] = [];

async function customerPage(browser: Browser, email: string): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`/project/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/project$/);
  return page;
}

/** Fetches a file with the page's own session (the cookie is Secure: page.request would arrive signed out). */
async function fetchFile(page: Page, href: string): Promise<{ status: number; bytes: Buffer }> {
  const { status, base64 } = await page.evaluate(async (target) => {
    const response = await fetch(target, { redirect: "manual" });
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return { status: response.status, base64: btoa(binary) };
  }, href);
  return { status, bytes: Buffer.from(base64, "base64") };
}

async function lead(name: string, email: string, status: string): Promise<{ id: string; projectNo: number }> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550161', ${email}, 'Henderson', 'phone', ${status}) returning id, project_no`;
  return { id: row.id as string, projectNo: Number(row.project_no) };
}

const documentsTab = async (page: Page, jobId: string) => {
  await page.goto(`/admin/jobs/${jobId}?tab=documents`);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
};

/**
 * What a sent PDF draws, as one string: the words the client reads. The PDF draws through
 * winAnsiSafe (the em dash in a title becomes "-") and wraps lines, so compare against that.
 */
function drawnText(bytes: Buffer): string {
  const drawn = pdfText(bytes).join(" ");
  expect(drawn).not.toContain("{{");
  return drawn;
}

/** Creates a document from a template on the job's Documents tab; answers its draft panel. */
async function createDocument(page: Page, jobId: string, option: string, title: string) {
  await documentsTab(page, jobId);
  await page.getByLabel("Template").selectOption({ label: option });
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/tab=documents&doc=[0-9a-f-]{36}/);
  return page.getByRole("region", { name: `Draft: ${title}` });
}

/** Draws a stroke across a pad with the mouse: Chromium turns it into pointer events. */
async function scribble(page: Page, pad: Locator) {
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
}

let job: { id: string; projectNo: number };
let bystander: { id: string; projectNo: number };
let priorGuides: string[] = [];
const ackTitle = () => `${ACK_TEMPLATE} — ${formatProjectNo(job.projectNo)}`;
const signTitle = () => `${SIGN_TEMPLATE} — ${formatProjectNo(job.projectNo)}`;
const drawTitle = () => `${DRAW_TEMPLATE} — ${formatProjectNo(job.projectNo)}`;

test.beforeAll(async () => {
  if (!url) return;
  // Sending stores the PDF in Blob and acknowledging fingerprints the stored bytes, so this is a
  // release gate: a missing token fails loudly rather than skipping and reading green.
  if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
    throw new Error("E2E_BLOB_READ_WRITE_TOKEN is not set. The Documents tests must run against the test blob store, not skip.");
  }
  job = await lead(`${NAME} A`, CUSTOMER, "sold");
  bystander = await lead(`${NAME} B`, BYSTANDER, "sold");
  // One live install guide exists across the whole database: set any aside for the run.
  priorGuides = (await sql()`select id from document_templates where archived_at is null and kind = 'guide_install'`).map((r) => r.id as string);
  if (priorGuides.length > 0) await sql()`update document_templates set archived_at = now() where id = any(${priorGuides})`;
  await sql()`insert into document_templates (id, name, kind, response, body, created_by, updated_by)
    values (gen_random_uuid(), ${`E2E Install guide ${STAMP}`}, 'guide_install', 'view', ${"## Before we arrive\n\n- Clear the windowsills."}, ${OWNER}, ${OWNER})`;
  await sql()`insert into document_templates (id, name, kind, response, body, created_by, updated_by)
    values (gen_random_uuid(), ${SIGN_TEMPLATE}, 'change_order', 'sign', ${"## Change\n\nOne more shade for {{client_name}}."}, ${OWNER}, ${OWNER})`;
  await sql()`insert into document_templates (id, name, kind, response, body, created_by, updated_by)
    values (gen_random_uuid(), ${DRAW_TEMPLATE}, 'service_agreement', 'sign',
      ${"## 1. Scope\n\nTwo shades for {{client_name}}.\n\n## 2. Payment\n\nPaid on install."}, ${OWNER}, ${OWNER})`;
});

test.afterAll(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
  if (!url) return;
  const token = process.env.E2E_BLOB_READ_WRITE_TOKEN;
  if (token) {
    const files = await sql()`select blob_pathname from job_files where lead_id in (select id from leads where name like 'E2E Docs %')`;
    const images = await sql()`select signature_image_pathname, initials_image_pathname from contract_signatures
      where lead_id in (select id from leads where name like 'E2E Docs %')`;
    const paths = [
      ...files.map((f) => f.blob_pathname as string),
      ...images.flatMap((r) => [r.signature_image_pathname, r.initials_image_pathname]).filter((p): p is string => typeof p === "string"),
    ];
    if (paths.length > 0) await del(paths, { token }).catch((error) => console.error("Could not remove e2e blobs", error));
  }
  await sql()`delete from document_acknowledgements where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from contract_signatures where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from job_documents where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from job_events where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Docs %')`;
  await sql()`delete from leads where name like 'E2E Docs %'`;
  await sql()`delete from document_templates where created_by = ${OWNER}`;
  if (priorGuides.length > 0) await sql()`update document_templates set archived_at = null where id = any(${priorGuides})`;
  await sql()`delete from customer_login_tokens where email like 'e2e-docs-%'`;
  await sql()`delete from customer_sessions where email like 'e2e-docs-%'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("the owner writes an acknowledge template, and an unknown field is refused", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/admin/documents");
  await expect(page.getByRole("link", { name: "Documents" }).first()).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Kind").selectOption("service_agreement");
  await page.getByLabel("Name").fill(ACK_TEMPLATE);
  await page.getByLabel("Client response").selectOption("acknowledge");
  const text = page.getByLabel("Text");
  await text.fill("## Scope of work\n\nHello {{client_first_name}}. Your deposit is {{deposit}}.\n\n{{nope}}");
  // The editor names the problem live, with the same words saving refuses with.
  await expect(page.getByRole("alert").filter({ hasText: "Unknown field {{nope}}." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Preview" }).getByRole("heading", { name: "Scope of work" })).toBeVisible();
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByRole("list", { name: "Template problems" })).toHaveText("Unknown field {{nope}}.");
  // Controlled fields: the refusal keeps everything the owner typed.
  await expect(page.getByLabel("Name")).toHaveValue(ACK_TEMPLATE);
  await expect(page.getByLabel("Client response")).toHaveValue("acknowledge");
  expect(await sql()`select id from document_templates where name = ${ACK_TEMPLATE}`).toHaveLength(0);

  await text.fill("## Scope of work\n\nHello {{client_first_name}}. Your deposit is {{deposit}}.");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/);
  const [row] = await sql()`select kind, response, body from document_templates where name = ${ACK_TEMPLATE} and archived_at is null`;
  // Stored with LF, exactly as typed.
  expect(row).toEqual({ kind: "service_agreement", response: "acknowledge", body: "## Scope of work\n\nHello {{client_first_name}}. Your deposit is {{deposit}}." });
});

test("a document from it carries the client's details, and can't go out with a field left", async ({ page }) => {
  await signInOwner(page);
  const panel = await createDocument(page, job.id, `${ACK_TEMPLATE} (Service agreement)`, ackTitle());
  await expect(panel.getByLabel("Title")).toHaveValue(ackTitle());
  await expect(panel.getByLabel("Text")).toHaveValue("## Scope of work\n\nHello E2E. Your deposit is {{deposit}}.");
  await expect(panel.getByRole("list", { name: "Before you can send" })).toContainText("Fill in {{deposit}} first.");
  await expect(panel.getByRole("button", { name: "Send to client" })).toBeDisabled();

  // A multi-line draft, typed as the owner types it. The browser posts each line break as CRLF; the
  // saved text must come back identical to the screen, or Send stays disabled ("save first") forever.
  const text = panel.getByLabel("Text");
  await text.fill("");
  await text.pressSequentially("## Scope of work");
  await text.press("Enter");
  await text.press("Enter");
  await text.pressSequentially("Hello E2E. Your deposit is $500.");
  await text.press("Enter");
  await text.pressSequentially("Balance on install day.");
  await expect(panel.getByText("Save your changes before sending.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Send to client" })).toBeDisabled();
  await panel.getByRole("button", { name: "Save draft" }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved.");
  await expect(panel.getByText("Save your changes before sending.")).toHaveCount(0);
  await expect(panel.getByRole("list", { name: "Before you can send" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Send to client" })).toBeEnabled();
  const [saved] = await sql()`select body from job_documents where lead_id = ${job.id} and title = ${ackTitle()}`;
  expect(saved.body).toBe("## Scope of work\n\nHello E2E. Your deposit is $500.\nBalance on install day.");

  await panel.getByRole("button", { name: "Send to client" }).click();
  // Resend is not configured in e2e: the document is sent and the email reported failed.
  await expect(page).toHaveURL(/tab=documents&sent=email-failed/);
  await expect(page.getByRole("status")).toHaveText(EMAIL_FAILED);

  const [doc] = await sql()`select d.status, f.shared_at, f.doc_type, f.name from job_documents d join job_files f on f.id = d.file_id
    where d.lead_id = ${job.id} and d.title = ${ackTitle()}`;
  expect(doc).toMatchObject({ status: "sent", doc_type: "other", name: `${ackTitle()}.pdf` });
  expect(doc.shared_at).not.toBeNull();
  const row = page.getByRole("list", { name: "Documents on this job" }).getByRole("listitem").filter({ hasText: ackTitle() });
  await expect(row).toContainText("Acknowledge");
  await expect(row).toContainText(/Sent [A-Z][a-z]{2} \d{1,2}, \d{4}/);
});

test("the client acknowledges it, fingerprinting the bytes served, and the owner sees Acknowledged", async ({ page, browser }) => {
  const customer = await customerPage(browser, CUSTOMER);
  const attention = customer.getByRole("region", { name: "Needs your attention" });
  await expect(attention.getByRole("heading", { name: "Documents to acknowledge" })).toBeVisible();
  // By text, not role: the form sits inside a CLOSED <details>, hidden from the accessibility tree.
  const item = attention.locator("details", { hasText: `Open ${ackTitle()}.pdf` });
  await expect(item).toHaveCount(1);
  const [file] = await sql()`select f.id from job_documents d join job_files f on f.id = d.file_id where d.lead_id = ${job.id} and d.title = ${ackTitle()}`;
  const served = await fetchFile(customer, `/project/files/${file.id}`);
  expect(served.status).toBe(200);
  // The PDF the client is served carries the text the owner saved and saw, fields filled.
  const drawn = drawnText(served.bytes);
  expect(drawn).toContain(winAnsiSafe(ackTitle()));
  expect(pdfText(served.bytes)).toContain("Scope of work");
  expect(drawn).toContain("Hello E2E. Your deposit is $500.");
  expect(drawn).toContain("Balance on install day.");
  await item.locator("summary").click();
  await item.getByLabel("Your full name").fill("Pat Client");
  await item.getByLabel(`I have read ${ackTitle()}`).check();
  await item.getByRole("button", { name: "Acknowledge" }).click();
  await expect(customer.getByRole("status")).toContainText("Thank you — your acknowledgement was recorded on");
  await expect(customer.getByRole("region", { name: "Needs your attention" })).toHaveCount(0);

  const rows = await sql()`select acknowledged_name, acknowledged_email, doc_sha256 from document_acknowledgements where file_id = ${file.id}`;
  expect(rows).toEqual([{ acknowledged_name: "Pat Client", acknowledged_email: CUSTOMER,
    doc_sha256: createHash("sha256").update(served.bytes).digest("hex") }]);
  const [doc] = await sql()`select status from job_documents where file_id = ${file.id}`;
  expect(doc.status).toBe("completed");

  await signInOwner(page);
  await documentsTab(page, job.id);
  await expect(page.getByRole("list", { name: "Documents on this job" }).getByRole("listitem").filter({ hasText: ackTitle() }))
    .toContainText(/Acknowledged [A-Z][a-z]{2} \d{1,2}, \d{4}/);
});

test("gate: the other client sees none of it, and their job is untouched", async ({ browser }) => {
  const other = await customerPage(browser, BYSTANDER);
  await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(other.getByRole("region", { name: "Needs your attention" })).toHaveCount(0);
  await expect(other.locator("main")).not.toContainText(ackTitle());
  const [file] = await sql()`select file_id from job_documents where lead_id = ${job.id} and title = ${ackTitle()}`;
  expect(await fetchFile(other, `/project/files/${file.file_id}`)).toMatchObject({ status: 404 });
  expect(await sql()`select id from job_documents where lead_id = ${bystander.id}`).toHaveLength(0);
  expect(await sql()`select id from document_acknowledgements where lead_id = ${bystander.id}`).toHaveLength(0);
  expect(await sql()`select id from job_events where lead_id = ${bystander.id} and kind = 'document'`).toHaveLength(0);
});

test("a sign document is signed through the contract path, and the owner sees Signed", async ({ page, browser }) => {
  await signInOwner(page);
  const panel = await createDocument(page, job.id, `${SIGN_TEMPLATE} (Change order)`, signTitle());
  await expect(panel.getByLabel("Text")).toHaveValue(`## Change\n\nOne more shade for ${NAME} A.`);
  await panel.getByRole("button", { name: "Send to client" }).click();
  await expect(page).toHaveURL(/tab=documents&sent=email-failed/);
  await expect(page.getByRole("status")).toHaveText(EMAIL_FAILED);

  const customer = await customerPage(browser, CUSTOMER);
  const attention = customer.getByRole("region", { name: "Needs your attention" });
  await expect(attention.getByRole("heading", { name: "Documents to sign" })).toBeVisible();
  const details = attention.locator("details", { hasText: `${signTitle()}.pdf` });
  await expect(details).toHaveCount(1);
  const [sent] = await sql()`select file_id from job_documents where lead_id = ${job.id} and title = ${signTitle()}`;
  const served = await fetchFile(customer, `/project/files/${sent.file_id}`);
  expect(served.status).toBe(200);
  const drawn = drawnText(served.bytes);
  expect(drawn).toContain(winAnsiSafe(signTitle()));
  expect(pdfText(served.bytes)).toContain("Change");
  expect(drawn).toContain(`One more shade for ${NAME} A.`);
  await details.locator("summary").click();
  await details.getByLabel("Your full name").fill("Pat Client");
  // A job document signs through the contract path, but the customer reads "document" and its title.
  await expect(attention.getByText(signTitle(), { exact: true })).toBeVisible();
  await expect(details.locator("summary")).toHaveText("Sign this document");
  await details.getByLabel("I agree to sign this document electronically").check();
  await details.locator("form").getByRole("button", { name: "Sign this document" }).click();
  await expect(customer.getByRole("status")).toContainText(`Thank you — you signed “${signTitle()}” on`);

  const [doc] = await sql()`select status, file_id from job_documents where lead_id = ${job.id} and title = ${signTitle()}`;
  expect(doc.status).toBe("completed");
  // The stamped copy is written in after(): wait for it so it is proven and afterAll removes its blob.
  await expect.poll(async () => {
    const [signature] = await sql()`select signed_file_id from contract_signatures where file_id = ${doc.file_id}`;
    return signature?.signed_file_id ?? null;
  }, { timeout: 20_000 }).not.toBeNull();

  await documentsTab(page, job.id);
  await expect(page.getByRole("list", { name: "Documents on this job" }).getByRole("listitem").filter({ hasText: signTitle() }))
    .toContainText(/Signed [A-Z][a-z]{2} \d{1,2}, \d{4}/);
});

test("a service agreement with numbered sections is signed by drawing, with initials on every section", async ({ page, browser }) => {
  await signInOwner(page);
  const panel = await createDocument(page, job.id, `${DRAW_TEMPLATE} (Service agreement)`, drawTitle());
  await panel.getByRole("button", { name: "Send to client" }).click();
  await expect(page).toHaveURL(/tab=documents&sent=email-failed/);

  const customer = await customerPage(browser, CUSTOMER);
  const [sent] = await sql()`select file_id from job_documents where lead_id = ${job.id} and title = ${drawTitle()}`;
  const unsigned = pdfText((await fetchFile(customer, `/project/files/${sent.file_id}`)).bytes);
  expect(unsigned.filter((text) => text === "Initials")).toHaveLength(2);
  expect(unsigned).toContain("Client signature");

  const details = customer.locator("details", { hasText: `${drawTitle()}.pdf` });
  await details.locator("summary").click();
  const form = details.locator("form");
  await form.getByRole("button", { name: "Draw" }).click();
  await form.getByLabel("Your full name").fill("Pat Client");
  await scribble(customer, form.getByLabel("Signature pad"));
  await scribble(customer, form.getByLabel("Initials pad"));
  await form.getByLabel("I agree to sign this document electronically and to initial every numbered section").check();
  await form.getByRole("button", { name: "Sign this document" }).click();
  await expect(customer.getByRole("status")).toContainText(`Thank you — you signed “${drawTitle()}” on`);

  const [signature] = await sql()`select signature_method, signed_initials, signature_image_pathname, initials_image_pathname
    from contract_signatures where file_id = ${sent.file_id}`;
  expect(signature).toMatchObject({ signature_method: "drawn", signed_initials: null });
  expect(signature.signature_image_pathname).toMatch(new RegExp(`^jobs/${job.id}/signatures/[0-9a-f-]{36}-signature\\.png$`));
  expect(signature.initials_image_pathname).toMatch(/-initials\.png$/);

  // The stamped copy is written in after(): wait for it.
  let signedFileId: string | null = null;
  await expect.poll(async () => {
    const [row] = await sql()`select signed_file_id from contract_signatures where file_id = ${sent.file_id}`;
    signedFileId = (row?.signed_file_id as string | null) ?? null;
    return signedFileId;
  }, { timeout: 20_000 }).not.toBeNull();
  const pages = await pdfPages((await fetchFile(customer, `/project/files/${signedFileId}`)).bytes);
  const body = pages.slice(0, -1);
  // One drawn image per numbered section plus the signature, on the document's own pages (spec §10).
  expect(body.reduce((sum, p) => sum + p.images, 0)).toBe(2 + 1);
  // The signature page shows both adopted images.
  expect(pages.at(-1)!.images).toBe(2);
  const blockPage = body.find((p) => p.runs.some((run) => run.text === "Client signature"))!;
  expect(blockPage.runs.map((run) => run.text)).toContain("Pat Client");
  const record = pages.at(-1)!.runs.map((run) => run.text).join("\n");
  expect(record).toContain("Method:     drawn");
  expect(record).toContain("Initialed sections: 1, 2");
});

test("Void withdraws a sent document from the client", async ({ page, browser }) => {
  await signInOwner(page);
  const panel = await createDocument(page, job.id, `${ACK_TEMPLATE} (Service agreement)`, ackTitle());
  await panel.getByLabel("Text").fill("## Scope of work\n\nSecond copy, deposit $500.");
  await panel.getByRole("button", { name: "Save draft" }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved.");
  await panel.getByRole("button", { name: "Send to client" }).click();
  await expect(page).toHaveURL(/tab=documents&sent=email-failed/);
  await expect(page.getByRole("status")).toHaveText(EMAIL_FAILED);

  // The client sees it before the void, so the void is what takes it away.
  const customer = await customerPage(browser, CUSTOMER);
  await expect(customer.getByRole("region", { name: "Needs your attention" }).getByRole("heading", { name: "Documents to acknowledge" })).toBeVisible();

  await page.getByRole("button", { name: `Void ${ackTitle()}` }).click();
  await expect(page.getByRole("button", { name: `Void ${ackTitle()}` })).toHaveCount(0);
  const [doc] = await sql()`select d.status, d.file_id, f.shared_at from job_documents d join job_files f on f.id = d.file_id
    where d.lead_id = ${job.id} and d.body = ${"## Scope of work\n\nSecond copy, deposit $500."}`;
  expect(doc).toMatchObject({ status: "void", shared_at: null });
  // Withdrawn means unreachable, not just unlisted: the client's own file route refuses it.
  expect(await fetchFile(customer, `/project/files/${doc.file_id}`)).toMatchObject({ status: 404 });

  await customer.reload();
  await expect(customer.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(customer.getByRole("region", { name: "Needs your attention" })).toHaveCount(0);
});

test("the install guide shows once the job is ordered, and the care guide does not yet", async ({ browser }) => {
  // Sold, with no install booked: no guide yet.
  const before = await customerPage(browser, CUSTOMER);
  await expect(before.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(before.getByRole("region", { name: "Getting ready for your install" })).toHaveCount(0);

  await sql()`update leads set status = 'ordered' where id = ${job.id}`;
  const customer = await customerPage(browser, CUSTOMER);
  const guide = customer.getByRole("region", { name: "Getting ready for your install" });
  await expect(guide.getByRole("heading", { name: "Before we arrive" })).toBeVisible();
  await expect(guide.getByText("Clear the windowsills.")).toBeVisible();
  await expect(customer.getByRole("region", { name: "Caring for your shades" })).toHaveCount(0);
});

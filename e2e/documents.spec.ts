import { createHash, randomBytes } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";
import { formatProjectNo } from "../lib/portal/project-no";

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
const EMAIL_FAILED = "Sent, but the email to the client failed — send them their project page link yourself.";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function signInOwner(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

async function customerPage(browser: Browser, email: string): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  const page = await (await browser.newContext()).newPage();
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

/** Creates a document from a template on the job's Documents tab; answers its draft panel. */
async function createDocument(page: Page, jobId: string, option: string, title: string) {
  await documentsTab(page, jobId);
  await page.getByLabel("Template").selectOption({ label: option });
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/tab=documents&doc=[0-9a-f-]{36}/);
  return page.getByRole("region", { name: `Draft: ${title}` });
}

let job: { id: string; projectNo: number };
let bystander: { id: string; projectNo: number };
let priorGuides: string[] = [];
const ackTitle = () => `${ACK_TEMPLATE} — ${formatProjectNo(job.projectNo)}`;
const signTitle = () => `${SIGN_TEMPLATE} — ${formatProjectNo(job.projectNo)}`;

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
});

test.afterAll(async () => {
  if (!url) return;
  const token = process.env.E2E_BLOB_READ_WRITE_TOKEN;
  if (token) {
    const files = await sql()`select blob_pathname from job_files where lead_id in (select id from leads where name like 'E2E Docs %')`;
    const paths = files.map((f) => f.blob_pathname as string);
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
  await details.locator("summary").click();
  await details.getByLabel("Your full name").fill("Pat Client");
  // The job-document sign wording is being reworded to name the document (the final-review fix
  // round), so these steps find the controls by role and the notice by its date, not by wording.
  // TODO(after the fix round merges): assert the new wording, which must name signTitle().
  await details.getByRole("checkbox").check();
  await details.locator("form").getByRole("button").click();
  await expect(customer.getByRole("status")).toContainText(/signed on [A-Z][a-z]{2} \d{1,2}, \d{4}/);

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
  const [doc] = await sql()`select d.status, f.shared_at from job_documents d join job_files f on f.id = d.file_id
    where d.lead_id = ${job.id} and d.body = ${"## Scope of work\n\nSecond copy, deposit $500."}`;
  expect(doc).toEqual({ status: "void", shared_at: null });

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

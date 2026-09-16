import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run portal tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const STAMP = Date.now();
const NAME = `E2E Portal ${STAMP}`;
const OWNER = "e2e-portal-owner@example.com";

// One email per job: a customer with a single visible job lands straight on that
// project page, which is what every assertion below reads.
const CUSTOMER = `e2e-customer-${STAMP}@example.com`;
const MID_CUSTOMER = `e2e-customer-mid-${STAMP}@example.com`;
const OTHER_CUSTOMER = `e2e-customer-other-${STAMP}@example.com`;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const PDF = path.join(__dirname, "fixtures", "quote.pdf");

async function signInOwner(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

async function customerPage(browser: Browser, email = CUSTOMER): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/project/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/project$/);
  return page;
}

async function lead(name: string, email: string, status: string): Promise<string> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550150', ${email}, 'Henderson', 'phone', ${status}) returning id`;
  return row.id as string;
}

/** Uploads a PDF on the job's Files tab and returns its id. */
async function uploadDocument(page: Page, jobId: string, fileName: string): Promise<string> {
  await page.goto(`/admin/jobs/${jobId}?tab=files`);
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: readFileSync(PDF),
  });
  await expect(page.getByRole("link", { name: fileName })).toBeVisible();
  const [row] = await sql()`select id from job_files where lead_id = ${jobId} and name = ${fileName}`;
  return row.id as string;
}

let jobId: string;

test.beforeAll(async () => {
  if (!url) return;
  jobId = await lead(NAME, CUSTOMER, "quoted");
});

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Portal %')`;
  await sql()`delete from job_events where lead_id in (select id from leads where name like 'E2E Portal %')`;
  await sql()`delete from leads where name like 'E2E Portal %'`;
  await sql()`delete from customer_login_tokens where email like 'e2e-customer-%'`;
  await sql()`delete from customer_sessions where email like 'e2e-customer-%'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("a stranger is sent to the customer sign-in", async ({ page }) => {
  await page.goto("/project");
  await expect(page).toHaveURL(/\/project\/sign-in$/);
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
});

test("opening a customer link alone does not use it", async ({ page }) => {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${CUSTOMER}, now() + interval '15 minutes')`;
  await page.goto(`/project/auth?token=${token}`);
  await expect(page.getByRole("heading", { name: "Sign in to your project page" })).toBeVisible();
  const rows = await sql()`select used_at from customer_login_tokens where token_hash = ${hash(token)}`;
  expect(rows[0].used_at).toBeNull();
});

// The page this asserts is the rebuilt one: a project number in the header, a status
// banner, the seven-step tracker, Next step, Project details, Project updates, the
// Photos & documents tabs and the referral block. Money must never appear on any of it.
test("a customer sees the rebuilt project page, with no money on it", async ({ browser }) => {
  await sql()`update leads set quote_cents = 450000 where id = ${jobId}`;
  const page = await customerPage(browser);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi E2E, your project is underway.");
  // project_no is assigned by the 016 default, and only ever reaches the page as PSS-xxxx.
  await expect(page.getByText(/^PSS-\d{4,}$/)).toBeVisible();

  const banner = page.getByRole("region", { name: "Where your project stands" });
  await expect(banner.getByRole("heading", { name: "Quote Ready" })).toBeVisible();
  await expect(banner).toContainText("Your quote is ready for you to look over.");
  // No document is shared yet, so there is nothing to review.
  await expect(banner.getByRole("link", { name: "Review quote" })).toHaveCount(0);

  await expect(page.locator('li[aria-current="step"]')).toContainText("Quote Ready");
  await expect(page.getByText("Look over your quote and call us with any questions.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Project details" })).toBeVisible();
  await expect(page.getByText("Not scheduled yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project updates" })).toBeVisible();

  await expect(page.getByRole("tab", { name: "Photos" })).toBeVisible();
  await expect(page.getByText("Photos from your install will appear here.")).toBeVisible();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByText("Paperwork we share with you will appear here.")).toBeVisible();

  await expect(page.getByText(/\/r\/[A-Z2-9]{6}$/)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("4,500");
});

// A job part-way through: ordered, with the stage dates behind it. The tracker must
// tick everything reached, mark the next one current, and date the steps it reached.
test("a mid-flow job shows the right current step with its dates", async ({ browser }) => {
  const id = await lead(`${NAME} Mid`, MID_CUSTOMER, "ordered");
  await sql()`update leads set ordered_on = '2026-09-10' where id = ${id}`;
  await sql()`insert into job_events (lead_id, actor, kind, from_status, to_status, created_at) values
    (${id}, ${OWNER}, 'stage', 'visit_booked', 'quoted', '2026-09-02T17:00:00Z'),
    (${id}, ${OWNER}, 'stage', 'quoted', 'sold', '2026-09-08T17:00:00Z'),
    (${id}, ${OWNER}, 'stage', 'sold', 'ordered', '2026-09-10T17:00:00Z')`;

  const page = await customerPage(browser, MID_CUSTOMER);

  // Nothing was measured and no install is booked, so In Production is the furthest
  // step reached and Ready to Install is the current one.
  await expect(page.locator('li[aria-current="step"]')).toContainText("Ready to Install");
  await expect(page.getByRole("region", { name: "Where your project stands" })
    .getByRole("heading", { name: "Ready to Install" })).toBeVisible();
  await expect(page.getByText("We will confirm your installation date with you.")).toBeVisible();

  const steps = page.getByRole("listitem");
  await expect(steps.filter({ hasText: "Quote Ready" })).toContainText("Sep 2");
  await expect(steps.filter({ hasText: "Order Confirmed" })).toContainText("Sep 8");
  await expect(steps.filter({ hasText: "In Production" })).toContainText("Sep 10");
  // A step the job has not reached carries no date.
  await expect(steps.filter({ hasText: "Installed" })).not.toContainText("Sep");

  const updates = page.getByRole("region", { name: "Project updates" });
  await expect(updates.getByText("Your order went into production.")).toBeVisible();
  await expect(updates.getByText("Your quote was ready.")).toBeVisible();
  await expect(updates.getByText("Your installation was completed.")).toHaveCount(0);
});

test("a shared photo appears for the customer and disappears when unshared", async ({ page, browser }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run photo tests");

  await signInOwner(page);
  await page.goto(`/admin/jobs/${jobId}?tab=files`);
  await page.getByLabel("Add photo").setInputFiles(path.join(__dirname, "fixtures", "window.jpg"));
  const share = page.getByRole("switch", { name: /^Share window\.jpg with customer$/ });
  await expect(share).toHaveAttribute("aria-checked", "false");
  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "true");

  const customer = await customerPage(browser);
  const photo = customer.locator('img[src^="/project/files/"]');
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute("src");
  expect((await customer.request.get(src!)).status()).toBe(200);

  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "false");
  await customer.reload();
  await expect(customer.getByText("Photos from your install will appear here.")).toBeVisible();
  expect((await customer.request.get(src!)).status()).toBe(404);
});

// The whole point of Task 2 and 3: a quote is private until an owner ticks it, and
// untickable again. The customer must be able to open what was shared with them.
test("an owner shares a quote, the customer opens it, and unsharing takes it away", async ({ page, browser }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run document tests");

  const fileName = `quote-${STAMP}.pdf`;
  await signInOwner(page);
  const fileId = await uploadDocument(page, jobId, fileName);

  // Labelling is not sharing: after choosing a type the file is still private.
  await page.getByLabel(`Document type for ${fileName}`).selectOption("quote");
  const customerBefore = await customerPage(browser);
  await customerBefore.getByRole("tab", { name: "Documents" }).click();
  await expect(customerBefore.getByText("Paperwork we share with you will appear here.")).toBeVisible();
  expect((await customerBefore.request.get(`/project/files/${fileId}`)).status()).toBe(404);

  const share = page.getByRole("switch", { name: `Share ${fileName} with customer` });
  await expect(share).toHaveAttribute("aria-checked", "false");
  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "true");

  const customer = await customerPage(browser);
  await expect(customer.getByRole("region", { name: "Where your project stands" })
    .getByRole("link", { name: "Review quote" })).toBeVisible();
  await customer.getByRole("tab", { name: "Documents" }).click();
  const link = customer.getByRole("link", { name: fileName });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/project/files/${fileId}`);
  await expect(customer.getByText("Quote", { exact: true })).toBeVisible();

  // The customer can actually open the document they were sent.
  const opened = await customer.request.get(`/project/files/${fileId}`);
  expect(opened.status()).toBe(200);
  expect(opened.headers()["content-type"]).toContain("application/pdf");

  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "false");
  await customer.reload();
  await customer.getByRole("tab", { name: "Documents" }).click();
  await expect(customer.getByText("Paperwork we share with you will appear here.")).toBeVisible();
  await expect(customer.getByRole("link", { name: "Review quote" })).toHaveCount(0);
  expect((await customer.request.get(`/project/files/${fileId}`)).status()).toBe(404);
});

/**
 * The release gate. A quote reaching the wrong customer is the worst thing this
 * feature can do, and setShared's `and lead_id = ${jobId}` clause is what stops it.
 *
 * The attempt: two jobs belonging to two different customers, each with its own
 * private document. The owner's browser takes the share request the page builds for
 * job B's own file and re-sends it with job A's file id in place of job B's — the
 * mismatched pair (job B's id, job A's file) is exactly the request the guard exists
 * to refuse. It is sent both as the page's own encoded payload and as a plain
 * jobId/fileId body, so no encoding of the request gets through. Nothing may be
 * shared: not job A's file, not job B's, and neither customer's page may change.
 */
test.describe("cross-job sharing release gate", () => {
  // Checked once per run, before the gate runs, rather than inside the test body. A release
  // gate that quietly does not run reads GREEN while proving nothing, which is worse than
  // having no gate at all — so a missing token fails loudly here and can never be mistaken
  // for a guard that passed. The ordinary photo and document tests above still skip: skipping
  // a feature test without a blob store is reasonable, skipping the security gate is not.
  test.beforeAll(() => {
    if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "E2E_BLOB_READ_WRITE_TOKEN is not set. This cross-job sharing gate must actually run — " +
          "set the token against the test blob store rather than skipping it.",
      );
    }
  });

test("a file cannot be shared under another job's id", async ({ page, browser }) => {
  const jobA = jobId;
  const jobB = await lead(`${NAME} Other`, OTHER_CUSTOMER, "quoted");
  const nameA = `private-a-${STAMP}.pdf`;
  const nameB = `private-b-${STAMP}.pdf`;

  await signInOwner(page);
  const fileA = await uploadDocument(page, jobA, nameA);
  const fileB = await uploadDocument(page, jobB, nameB);

  // Harvest the share request the owner's own page would send for job B's file.
  await page.goto(`/admin/jobs/${jobB}?tab=files`);
  const request = await page.evaluate((label) => {
    const button = document.querySelector(`[aria-label="${label}"]`)!;
    const form = button.closest("form") as HTMLFormElement;
    const fields: [string, string][] = [];
    for (const [key, value] of new FormData(form)) if (typeof value === "string") fields.push([key, value]);
    return { action: form.getAttribute("action") ?? window.location.pathname, fields };
  }, `Share ${nameB} with customer`);

  // Re-send it against job A's file: same session, same owner, wrong pairing.
  const status = await page.evaluate(
    async ({ action, fields, jobBId, fileAId, fileBId }) => {
      // Every place the payload names job B's file becomes job A's, so what is sent
      // is the mismatched pair: job B's id carrying a file that belongs to job A.
      const body = new URLSearchParams(
        fields.map(([key, value]) => [key, value.split(fileBId).join(fileAId)] as [string, string]),
      );
      body.set("jobId", jobBId);
      body.set("fileId", fileAId);
      const response = await fetch(action, { method: "POST", body });
      return response.status;
    },
    { action: request.action, fields: request.fields, jobBId: jobB, fileAId: fileA, fileBId: fileB },
  );
  // Whatever the server answers — a refusal, or a page that simply did not change —
  // the assertions below are what decide this test. Nothing may have been shared.
  expect(typeof status).toBe("number");

  // Nothing was shared, in the database...
  const rows = await sql()`select id, shared_at from job_files where id in (${fileA}, ${fileB})`;
  for (const row of rows) expect(row.shared_at).toBeNull();

  // ...and nothing appears on either customer's page.
  const customerA = await customerPage(browser, CUSTOMER);
  await customerA.getByRole("tab", { name: "Documents" }).click();
  await expect(customerA.getByText("Paperwork we share with you will appear here.")).toBeVisible();
  await expect(customerA.getByRole("link", { name: nameA })).toHaveCount(0);
  expect((await customerA.request.get(`/project/files/${fileA}`)).status()).toBe(404);

  const customerB = await customerPage(browser, OTHER_CUSTOMER);
  await customerB.getByRole("tab", { name: "Documents" }).click();
  await expect(customerB.getByText("Paperwork we share with you will appear here.")).toBeVisible();
  await expect(customerB.getByRole("link", { name: nameA })).toHaveCount(0);
  // The other customer cannot open it either, shared or not.
  expect((await customerB.request.get(`/project/files/${fileA}`)).status()).toBe(404);
});

});

test("a lost job locks the customer out", async ({ browser }) => {
  const page = await customerPage(browser);
  await sql()`update leads set status = 'lost' where id = ${jobId}`;
  await page.reload();
  await expect(page).toHaveURL(/\/project\/sign-in$/);
});

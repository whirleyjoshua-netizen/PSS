import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
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
const MSG_CUSTOMER = `e2e-customer-msg-${STAMP}@example.com`;
const SERVICE_CUSTOMER = `e2e-customer-service-${STAMP}@example.com`;
// Two jobs on one email, deliberately: this customer is the "Your projects" list.
const LIST_CUSTOMER = `e2e-customer-list-${STAMP}@example.com`;
// The release gate's two sides: one customer who files the request, one whose job is named.
const GATE_CUSTOMER = `e2e-customer-gate-${STAMP}@example.com`;
const VICTIM_CUSTOMER = `e2e-customer-victim-${STAMP}@example.com`;
// Phase 2's journeys: approving a quote, confirming an installation, reporting a fault.
const APPROVE_CUSTOMER = `e2e-customer-approve-${STAMP}@example.com`;
const ACK_CUSTOMER = `e2e-customer-ack-${STAMP}@example.com`;
const FAULT_CUSTOMER = `e2e-customer-fault-${STAMP}@example.com`;
// The approval release gate's two sides: the customer who approves, and the one whose quoted
// job must not move because of it.
const APPROVER_CUSTOMER = `e2e-customer-approver-${STAMP}@example.com`;
const BYSTANDER_CUSTOMER = `e2e-customer-bystander-${STAMP}@example.com`;
// Signing a contract: one email per job, for the same reason as above.
const SIGNER_CUSTOMER = `e2e-customer-signer-${STAMP}@example.com`;
const OUTPUT_CUSTOMER = `e2e-customer-output-${STAMP}@example.com`;
const FROZEN_CUSTOMER = `e2e-customer-frozen-${STAMP}@example.com`;
const SIGN_ATTACKER = `e2e-customer-sign-attacker-${STAMP}@example.com`;
const SIGN_BYSTANDER = `e2e-customer-sign-bystander-${STAMP}@example.com`;

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

type Download = { status: number; type: string; html: boolean };

/**
 * Fetches a file as the customer's own browser would.
 *
 * NOT `page.request.get`: the session cookie is `Secure` (the e2e server runs a
 * production build), and Playwright's APIRequestContext does not send it over plain
 * http — so those requests arrive signed out, get 307'd to /project/sign-in and come
 * back as 200 text/html. An assertion written that way passes even if the file route
 * does not exist, which is exactly the failure a security gate must never have.
 * Fetching from inside the page carries the real session.
 *
 * `redirect: "manual"` keeps a redirect from being followed into a 200 sign-in page:
 * a bounced request surfaces as status 0, which matches neither 200 nor 404.
 */
async function download(page: Page, url: string): Promise<Download> {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { redirect: "manual" });
    const type = response.headers.get("content-type") ?? "";
    const body = response.type === "opaqueredirect" ? "" : (await response.text()).slice(0, 200);
    return { status: response.status, type, html: /^\s*<(!doctype|html)/i.test(body) };
  }, url);
}

/** A real file came back: the right status, the right type, and not a page of HTML. */
function expectFile(result: Download, contentType: string) {
  expect(result.status).toBe(200);
  expect(result.type).toContain(contentType);
  expect(result.html).toBe(false);
}

/** The route refused it — a 404 from the route itself, not a bounce to sign-in. */
function expectNotFound(result: Download) {
  expect(result.status).toBe(404);
  expect(result.html).toBe(false);
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

/**
 * Shares a Quote document with the customer, by row rather than by upload.
 *
 * Approving is gated server-side on a document whose `doc_type` is `quote` and whose
 * `shared_at` is set (listSharedDocuments), and on nothing else — the action reads the name it
 * writes into the timeline from this row. None of the tests below ever fetches the file, so the
 * blob behind it is never touched.
 *
 * That is deliberate, and it is not a shortcut: uploadDocument() goes through the admin UI and
 * therefore needs E2E_BLOB_READ_WRITE_TOKEN, which the photo and document tests above are
 * allowed to skip on. The approval release gate must never be skippable — a gate that quietly
 * does not run reads green while proving nothing — so its fixture must not depend on a blob
 * store. Everything the guard actually reads is in this row.
 */
async function shareQuote(jobId: string, name: string): Promise<string> {
  const [row] = await sql()`insert into job_files
    (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, shared_at, doc_type)
    values (${jobId}, ${OWNER}, 'document', ${name}, 'application/pdf', 1024,
            ${`e2e/${jobId}/${name}`}, now(), 'quote')
    returning id`;
  return row.id as string;
}

let jobId: string;

test.beforeAll(async () => {
  if (!url) return;
  jobId = await lead(NAME, CUSTOMER, "quoted");
});

test.afterAll(async () => {
  if (!url) return;
  // A signature references its files, so it goes before them.
  await sql()`delete from contract_signatures where lead_id in (select id from leads where name like 'E2E Portal %')`;
  await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Portal %')`;
  await sql()`delete from job_events where lead_id in (select id from leads where name like 'E2E Portal %')`;
  // A service request creates a child job that points back at its parent with a foreign key, and
  // a child carries its parent's name — so it is inside the delete below and would be deleted in
  // the same statement that deletes the row it references. Children go first, on their own.
  await sql()`delete from leads where parent_job_id in (select id from leads where name like 'E2E Portal %')`;
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
// tick everything before the furthest step reached, mark that step itself current, and
// date the steps it reached.
test("a mid-flow job shows the right current step with its dates", async ({ browser }) => {
  const id = await lead(`${NAME} Mid`, MID_CUSTOMER, "ordered");
  await sql()`update leads set ordered_on = '2026-09-10' where id = ${id}`;
  await sql()`insert into job_events (lead_id, actor, kind, from_status, to_status, created_at) values
    (${id}, ${OWNER}, 'stage', 'visit_booked', 'quoted', '2026-09-02T17:00:00Z'),
    (${id}, ${OWNER}, 'stage', 'quoted', 'sold', '2026-09-08T17:00:00Z'),
    (${id}, ${OWNER}, 'stage', 'sold', 'ordered', '2026-09-10T17:00:00Z')`;

  const page = await customerPage(browser, MID_CUSTOMER);

  // Nothing was measured and no install is booked, so In Production is the furthest step
  // reached, and the spec makes the furthest step reached the current one. The customer is
  // never told a later milestone has happened: Ready to Install stays upcoming until an
  // install is actually booked.
  await expect(page.locator('li[aria-current="step"]')).toContainText("In Production");
  await expect(page.getByRole("region", { name: "Where your project stands" })
    .getByRole("heading", { name: "In Production" })).toBeVisible();
  await expect(page.getByText("We will call you to book your installation as soon as your order arrives.")).toBeVisible();
  await expect(page.locator('li[aria-current="step"]')).not.toContainText("Ready to Install");

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
  expectFile(await download(customer, src!), "image/jpeg");

  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "false");
  await customer.reload();
  await expect(customer.getByText("Photos from your install will appear here.")).toBeVisible();
  expectNotFound(await download(customer, src!));
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
  expectNotFound(await download(customerBefore, `/project/files/${fileId}`));

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

  // The customer can actually open the document they were sent — the PDF itself,
  // not a sign-in page wearing a 200.
  expectFile(await download(customer, `/project/files/${fileId}`), "application/pdf");

  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "false");
  await customer.reload();
  await customer.getByRole("tab", { name: "Documents" }).click();
  await expect(customer.getByText("Paperwork we share with you will appear here.")).toBeVisible();
  await expect(customer.getByRole("link", { name: "Review quote" })).toHaveCount(0);
  expectNotFound(await download(customer, `/project/files/${fileId}`));
});

/**
 * A quote reaching the wrong customer is the worst thing this feature can do. This
 * gate covers the part of that threat a browser can actually reach.
 *
 * WHY THERE IS NO CROSS-JOB SHARING TEST HERE, and where that proof lives instead:
 *
 * An earlier version of this file tried to forge a mismatched (jobId, fileId) share —
 * job B's id carrying job A's file — to prove setShared's `and lead_id = ${jobId}`
 * clause. It could not be done, and the test passed with the guard deleted from the
 * source and the app rebuilt. It was removed rather than left looking like cover.
 *
 * The reason is the dispatch path. `ShareSwitch` renders
 * `<form action={setFileShared.bind(null, jobId, fileId, !shared)}>`, and Next's docs
 * on Server Actions state that action IDs are "encrypted, non-deterministic" and that
 * closed-over/bound arguments are "automatically encrypted" under a private key
 * regenerated on every build. In the DOM that is all a client sees: an empty `action`
 * and opaque `$ACTION_REF_n` / `$ACTION_n:0` fields. The three arguments travel as ONE
 * per-build ciphertext, so a client can replay a whole valid triple but cannot mint a
 * mixed pair — swapping blobs between two forms swaps jobId, fileId and shared
 * together, which is never a mismatch. A hand-built POST without the framework's own
 * dispatch is handled as an ordinary navigation and never reaches the action at all.
 *
 * So the lead_id guard defends against OUR OWN code passing a wrong id, not against a
 * customer or a tampering owner. It is not an end-to-end fact, and its proof lives in
 * two other places, which cover different things:
 *
 *  - tests/admin/file-sharing.test.ts:50 pins the SQL TEXT and no more. It runs in CI
 *    and fails the moment the `and lead_id = ${jobId}` clause leaves the statement, so
 *    it is the tripwire for anyone editing setShared — but it asserts a string, not
 *    that a database refuses anything.
 *  - scripts/verify-share-guard.ts checks the guard's BEHAVIOUR: it calls setShared
 *    against a real database with the genuine mismatched pair (a document on lead A,
 *    shared under lead B's id) and a positive control with the correct pair, so that
 *    "refused" cannot be confused with "the function is broken". With the guard in
 *    place the mismatched call returns false and leaves shared_at NULL while the
 *    correct call returns true and sets it; with the clause removed the mismatched
 *    call returns true and a real cross-job share happens.
 *
 * That script is run BY HAND against a Neon branch. It is in no suite, CI does not
 * execute it, and nothing here runs it — so do not read the tests above as covering
 * it. If you change setShared's guard, run the script yourself; if you cannot, the
 * guard is unverified rather than assumed good.
 *
 * What IS reachable from a browser, and what this gate therefore proves: one
 * customer's session must not be able to open another customer's file, even a file
 * that is genuinely shared. That is enforced by the ownership check in
 * app/(site)/project/files/[fileId]/route.ts, and removing it turns this test red.
 */
test.describe("customer file isolation", () => {
  // Checked once per run, before the gate runs, rather than inside the test body. A release
  // gate that quietly does not run reads GREEN while proving nothing, which is worse than
  // having no gate at all — so a missing token fails loudly here and can never be mistaken
  // for a guard that passed. The ordinary photo and document tests above still skip: skipping
  // a feature test without a blob store is reasonable, skipping the security gate is not.
  test.beforeAll(() => {
    if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "E2E_BLOB_READ_WRITE_TOKEN is not set. This file isolation gate must actually run — " +
          "set the token against the test blob store rather than skipping it.",
      );
    }
  });

test("one customer cannot open another customer's file, shared or not", async ({ page, browser }) => {
  const jobA = jobId;
  const jobB = await lead(`${NAME} Other`, OTHER_CUSTOMER, "quoted");
  const nameA = `shared-a-${STAMP}.pdf`;
  const nameB = `private-b-${STAMP}.pdf`;

  await signInOwner(page);
  const fileA = await uploadDocument(page, jobA, nameA);
  const fileB = await uploadDocument(page, jobB, nameB);

  // Share job A's file through the real switch — the framework's own dispatch, the
  // only path that actually reaches setFileShared.
  await page.goto(`/admin/jobs/${jobA}?tab=files`);
  const share = page.getByRole("switch", { name: `Share ${nameA} with customer` });
  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "true");

  // The positive control, and it is what keeps the refusals below honest: the file is
  // genuinely shared and genuinely downloadable, so a 404 for anyone else is the
  // ownership check doing its work rather than the route being broken for everybody.
  const customerA = await customerPage(browser, CUSTOMER);
  await customerA.getByRole("tab", { name: "Documents" }).click();
  await expect(customerA.getByRole("link", { name: nameA })).toBeVisible();
  expectFile(await download(customerA, `/project/files/${fileA}`), "application/pdf");

  // The other customer must not reach it, though it IS shared — this is the assertion
  // the gate exists for. It goes red if route.ts stops checking that the file's job is
  // one of the caller's own. It proves ownership, not sharing: that route refuses a
  // non-owner whether or not the file is shared.
  const customerB = await customerPage(browser, OTHER_CUSTOMER);
  await customerB.getByRole("tab", { name: "Documents" }).click();
  await expect(customerB.getByText("Paperwork we share with you will appear here.")).toBeVisible();
  await expect(customerB.getByRole("link", { name: nameA })).toHaveCount(0);
  expectNotFound(await download(customerB, `/project/files/${fileA}`));

  // And their own unshared file stays private to them too, so the refusal above is not
  // just "customer B can download nothing": private-by-default is the other half.
  const [row] = await sql()`select shared_at from job_files where id = ${fileB}`;
  expect(row.shared_at).toBeNull();
  expectNotFound(await download(customerB, `/project/files/${fileB}`));
});

});

test("a customer sends a message and the owners find it on the job", async ({ page, browser }) => {
  const id = await lead(`${NAME} Message`, MSG_CUSTOMER, "quoted");
  const body = `The left blind in the den arrived scuffed ${STAMP}`;

  const customer = await customerPage(browser, MSG_CUSTOMER);
  await customer.getByLabel("Or send us a message about your project").fill(body);
  await customer.getByRole("button", { name: "Send message" }).click();

  // The same answer a throttled send gets: a double-click is never an error.
  await expect(customer.getByRole("status"))
    .toContainText("Thanks — we have your message and will come back to you.");
  // It is theirs, so it comes back to them on their own page.
  await expect(customer.getByRole("heading", { name: "Messages you have sent" })).toBeVisible();
  await expect(customer.getByText(body)).toBeVisible();

  // The point of the feature: the owners see the customer's words on the job, attributed.
  await signInOwner(page);
  await page.goto(`/admin/jobs/${id}?tab=activity`);
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByText(MSG_CUSTOMER)).toBeVisible();
});

test("a customer requests a service and a linked job reaches the board", async ({ page, browser }) => {
  const name = `${NAME} Service`;
  const id = await lead(name, SERVICE_CUSTOMER, "installed");

  const customer = await customerPage(browser, SERVICE_CUSTOMER);
  // The after-work section exists only once the work is installed.
  const afterWork = customer.getByRole("region", { name: "After the work is done" });
  await expect(afterWork.getByRole("link", { name: "Leave a review" })).toBeVisible();
  await afterWork.getByRole("link", { name: "Request a service" }).click();
  await expect(customer).toHaveURL(new RegExp(`/project/${id}/service$`));

  // Nothing was measured on this job, so the picker is just the text box.
  await customer.getByLabel("Tell us which window or room.").fill("The big window in the den");
  await customer.getByLabel("What is happening?").selectOption("wont-move");
  await customer.getByLabel("Anything else we should know? (optional)").fill("It jams halfway.");
  await customer.getByRole("button", { name: "Request a service" }).click();

  // Back on the project page, naming the number the customer quotes when they call.
  await expect(customer).toHaveURL(new RegExp(`/project/${id}\\?requested=PSS-\\d{4,}$`));
  await expect(customer.getByRole("status")).toContainText("Thanks — we have your request");
  await expect(afterWork).toContainText(/Service requested on \w{3} \d{1,2}.*we will be in touch\./);

  // A REAL job on the owners' board, linked to the original — not a note on the old one.
  const [child] = await sql()`select id, source, status, project_no from leads where parent_job_id = ${id}`;
  expect(child).toBeTruthy();
  expect(child.source).toBe("service");
  expect(child.status).toBe("new");

  // The service job is status `new`, which is below PORTAL_STAGES, so it must NOT become a
  // second project for the customer: their page stays the single project it was.
  await customer.goto("/project");
  await expect(customer.getByRole("heading", { level: 1 })).toContainText("your project is underway");

  await signInOwner(page);
  await page.goto("/admin");
  const newColumn = page.getByRole("region", { name: /^New lead ·/ });
  const card = newColumn.locator("div").filter({ hasText: name }).last();
  await expect(card).toContainText("Service");

  // And from the new job, the owner can get back to the job it came out of.
  await page.goto(`/admin/jobs/${child.id}`);
  await expect(page.getByRole("link", { name: /^Service request for PSS-\d{4,}$/ })).toBeVisible();
});

// The defect the owner personally hit: his own two Las Vegas jobs read identically in the list.
// lead() gives every job the same city and no street address, which is exactly that case.
test("two jobs in one city are told apart in the project list", async ({ browser }) => {
  const first = await lead(`${NAME} List A`, LIST_CUSTOMER, "quoted");
  const second = await lead(`${NAME} List B`, LIST_CUSTOMER, "ordered");
  const [a] = await sql()`select project_no from leads where id = ${first}`;
  const [b] = await sql()`select project_no from leads where id = ${second}`;

  const customer = await customerPage(browser, LIST_CUSTOMER);
  await expect(customer.getByRole("heading", { name: "Your projects" })).toBeVisible();

  // Scoped to the projects list: the site header, mobile menu and footer render 14 list items of
  // their own on every public page, so an unscoped getByRole("listitem") reads the whole document.
  const rows = customer.getByRole("list", { name: "Your projects" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  // Both rows say Henderson and nothing else about the place — the number and the step are the
  // only things that distinguish them, so they are what the assertions read.
  await expect(rows.filter({ hasText: `PSS-${String(a.project_no).padStart(4, "0")}` }))
    .toContainText("Quote Ready");
  await expect(rows.filter({ hasText: `PSS-${String(b.project_no).padStart(4, "0")}` }))
    .toContainText("In Production");
  expect(a.project_no).not.toBe(b.project_no);
});

/**
 * THE RELEASE GATE: a customer files a service request naming another customer's job id.
 *
 * WHY THIS GATE IS REAL, unlike the file-sharing one above. The difference is how the id
 * reaches the action, and it is the only thing that matters:
 *
 *  - `ShareSwitch` binds its arguments — `setFileShared.bind(null, jobId, fileId, !shared)` —
 *    so jobId travels as part of one encrypted, per-build blob. Editing it from a browser
 *    edits ciphertext, the action never dispatches, and a test written against it passes
 *    whether or not the guard exists. That is why there is no cross-job sharing test here.
 *  - `ServiceForm` and `MessageForm` do the opposite. Each renders a plain
 *    `<input type="hidden" name="jobId" value={jobId} />` and the action reads it back with
 *    `formData.get("jobId")` (app/(site)/project/actions.ts). It is an ordinary form field in
 *    ordinary FormData. A customer can put any id they like in it and the framework will
 *    dispatch the action with it, which is precisely the attack below.
 *
 * So this gate is reachable, and it can fail. What stops it is the ownership check in
 * `requestServiceAction`/`sendCustomerMessage`, which re-derives the caller's own jobs from
 * the session and refuses an id that is not among them. Delete that check and this test goes
 * red: a real service job would be created against the victim's job and the row assertions
 * below would find it.
 *
 * It asserts on the EFFECT, never on a status code: no job created, no event row written,
 * and nothing on either customer's page. The positive control at the end is what keeps the
 * refusals honest — the same form, unedited, must still create a job, so "nothing happened"
 * cannot quietly mean "the form is broken for everyone".
 */
test("a customer cannot act on another customer's job", async ({ browser }) => {
  const victimId = await lead(`${NAME} Victim`, VICTIM_CUSTOMER, "installed");
  const attackerId = await lead(`${NAME} Attacker`, GATE_CUSTOMER, "installed");

  const attacker = await customerPage(browser, GATE_CUSTOMER);

  // --- The service request, aimed at the victim's job ---
  await attacker.goto(`/project/${attackerId}/service`);
  await attacker.getByLabel("Tell us which window or room.").fill("Not my window");
  await attacker.getByLabel("What is happening?").selectOption("damaged");
  // The one edit: the hidden field now carries the victim's job id. Everything else about the
  // post is genuine, so this is the framework's own dispatch reaching the real action.
  await attacker.$eval(
    'input[name="jobId"]',
    (element, id) => { (element as HTMLInputElement).value = id; },
    victimId,
  );
  await attacker.getByRole("button", { name: "Request a service" }).click();

  // The action ran and refused. This message is the proof the post was not silently dropped —
  // without it the assertions below would pass on a request that never reached the server.
  await expect(attacker.getByRole("alert").filter({ hasText: "We could not find that project." })).toHaveCount(1);

  // The effect, which is what the gate is actually about: nothing was created anywhere.
  const children = await sql()`select id from leads where parent_job_id = ${victimId}`;
  expect(children).toHaveLength(0);
  const serviceEvents = await sql()`
    select id from job_events where lead_id = ${victimId} and kind = 'service'`;
  expect(serviceEvents).toHaveLength(0);
  // Nor was it quietly filed against the attacker's own job instead.
  const ownChildren = await sql()`select id from leads where parent_job_id = ${attackerId}`;
  expect(ownChildren).toHaveLength(0);

  // --- The message, aimed at the same job ---
  const forged = `forged message ${STAMP}`;
  await attacker.goto(`/project/${attackerId}`);
  await attacker.getByLabel("Or send us a message about your project").fill(forged);
  // Scoped to the message form's OWN hidden field. A bare 'input[name="jobId"]' takes the first
  // one on the page, and this page now carries several — Approve and Acknowledge each render one
  // too. At `installed` the acknowledge form comes first, so the unscoped selector forged the
  // wrong form's id, the message posted with the attacker's own job, and it succeeded: no alert,
  // nothing written to the victim, and every later assertion here passed while this test had
  // stopped exercising the message path at all.
  await attacker
    .locator("form", { has: attacker.getByLabel("Or send us a message about your project") })
    .locator('input[name="jobId"]')
    .evaluate((element, id) => { (element as HTMLInputElement).value = id; }, victimId);
  await attacker.getByRole("button", { name: "Send message" }).click();
  await expect(attacker.getByRole("alert").filter({ hasText: "We could not find that project." })).toHaveCount(1);

  const messages = await sql()`
    select id from job_events where lead_id = ${victimId} and kind = 'message'`;
  expect(messages).toHaveLength(0);

  // Neither customer's page shows a trace of any of it.
  const victim = await customerPage(browser, VICTIM_CUSTOMER);
  await expect(victim.getByRole("region", { name: "After the work is done" }))
    .not.toContainText("Service requested on");
  await expect(victim.getByText(forged)).toHaveCount(0);
  await attacker.goto(`/project/${attackerId}`);
  await expect(attacker.getByRole("region", { name: "After the work is done" }))
    .not.toContainText("Service requested on");

  // THE POSITIVE CONTROL. The same form, the same session, the id left alone: it must work.
  // If this fails, every refusal above proved nothing about the guard.
  await attacker.goto(`/project/${attackerId}/service`);
  await attacker.getByLabel("Tell us which window or room.").fill("My own window");
  await attacker.getByLabel("What is happening?").selectOption("damaged");
  await attacker.getByRole("button", { name: "Request a service" }).click();
  await expect(attacker).toHaveURL(new RegExp(`/project/${attackerId}\\?requested=PSS-\\d{4,}$`));
  const created = await sql()`select id from leads where parent_job_id = ${attackerId}`;
  expect(created).toHaveLength(1);
});

/**
 * Spec §8, first journey: a customer approves a quote; the job reads Sold on the admin board,
 * and its timeline names the CUSTOMER.
 *
 * The timeline assertion is the one that matters months later. setStage takes `actor` as a
 * plain string, so a customer-driven move is recorded honestly as the customer's own email
 * rather than disguised as an owner's click — and the body names the document they were
 * looking at, read server-side from job_files by the action. The post carries only the job id.
 */
test("a customer approves a quote and the job reads Sold, in their own name", async ({ page, browser }) => {
  const name = `${NAME} Approve`;
  const id = await lead(name, APPROVE_CUSTOMER, "quoted");
  const quoteName = `quote-approve-${STAMP}.pdf`;
  await shareQuote(id, quoteName);

  const customer = await customerPage(browser, APPROVE_CUSTOMER);
  await customer.goto(`/project/${id}`);
  const banner = customer.getByRole("region", { name: "Where your project stands" });
  await expect(banner.getByRole("heading", { name: "Quote Ready" })).toBeVisible();

  // Two steps on purpose: the reveal carries the sentence about what approving means, and the
  // button is not reachable until it has been opened. One stray tap must not order materials.
  // exact: true — "Approve this quote" is a prefix of the confirm button's "Yes, approve this
  // quote", so a loose match resolves to two elements and the click fails before the gate is
  // ever exercised. A spec that dies here fails identically against correct code.
  await banner.getByText("Approve this quote", { exact: true }).click();
  await expect(
    banner.getByText("Approving tells us to go ahead and order. We will email you to arrange the details."),
  ).toBeVisible();
  await banner.getByRole("button", { name: "Yes, approve this quote" }).click();

  // The outcome rides back on the URL — a plain form post and a redirect, no client state — but
  // the sentence is re-derived from the job's real status, never printed from the flag.
  await expect(customer).toHaveURL(new RegExp(`/project/${id}\\?approved=1$`));
  await expect(customer.getByRole("status"))
    .toContainText("Thank you — we have your approval and will be in touch to arrange the details.");
  // The banner beside it is the confirmation's own evidence, and the control is gone: there is
  // nothing left to approve.
  await expect(banner.getByRole("heading", { name: "Order Confirmed" })).toBeVisible();
  await expect(customer.getByText("Approve this quote")).toHaveCount(0);

  // The row itself. One stage event, and exactly one — the actor is the customer, and the body
  // names the document, which is what an owner reads back in six months.
  const [row] = await sql()`select status from leads where id = ${id}`;
  expect(row.status).toBe("sold");
  const events = await sql()`select actor, from_status, to_status, body from job_events
    where lead_id = ${id} and kind = 'stage'`;
  expect(events).toEqual([
    {
      actor: APPROVE_CUSTOMER,
      from_status: "quoted",
      to_status: "sold",
      body: `Approved "${quoteName}" from their project page`,
    },
  ]);

  // The owners' side: the job has moved column, and the timeline names the customer.
  await signInOwner(page);
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: /^Sold ·/ }).getByRole("link", { name: new RegExp(name) }))
    .toBeVisible();
  await page.goto(`/admin/jobs/${id}?tab=activity`);
  await expect(page.getByText(`Approved "${quoteName}" from their project page`)).toBeVisible();
  await expect(page.getByText(APPROVE_CUSTOMER)).toBeVisible();
});

/**
 * Spec §8, second journey: a customer confirms an installation and the job reads Completed.
 *
 * This is the ONLY place the completed write is proved against a real Postgres. The unit tests
 * mock setStage, so they pin the call and nothing about the statement — its `status <> $to`
 * guard, its stage_changed_at, or the job_events row it writes in the same statement. If this
 * test is not run against a database, that write is unverified rather than assumed good.
 *
 * Completed is not a board column (BOARD_STAGES stops at installed), so the owners' side is
 * read from the job's own stage stepper, exactly as e2e/stages.spec.ts reads it.
 */
test("a customer confirms an installation and the job reads Completed", async ({ page, browser }) => {
  const name = `${NAME} Acknowledge`;
  const id = await lead(name, ACK_CUSTOMER, "installed");
  const [before] = await sql()`select stage_changed_at from leads where id = ${id}`;

  const customer = await customerPage(browser, ACK_CUSTOMER);
  await customer.goto(`/project/${id}`);
  const banner = customer.getByRole("region", { name: "Where your project stands" });
  await expect(banner.getByText("Is everything how you wanted it?")).toBeVisible();
  // Two clearly different answers, never one button with a tick: the unhappy one is the whole
  // reason for asking, so it must be here too.
  await expect(banner.getByRole("link", { name: "Something is not right" })).toBeVisible();
  await banner.getByRole("button", { name: "Yes, everything looks great" }).click();

  await expect(customer).toHaveURL(new RegExp(`/project/${id}\\?acknowledged=1$`));
  await expect(customer.getByRole("status")).toContainText(
    "Thank you for letting us know — we are glad it is right.",
  );
  // The question is not asked twice. It keys on the job's RAW status, which is now `completed`;
  // toPortalStage folds that back into `installed`, so a page reading the folded value would
  // still be asking a customer who has already answered.
  await expect(customer.getByText("Is everything how you wanted it?")).toHaveCount(0);

  // setStage's real statement, which nothing else in this branch proves: the status, the
  // stamp it moves, and the timeline row written alongside it.
  const [row] = await sql()`select status, stage_changed_at from leads where id = ${id}`;
  expect(row.status).toBe("completed");
  expect(new Date(row.stage_changed_at as string).getTime())
    .toBeGreaterThan(new Date(before.stage_changed_at as string).getTime());
  const events = await sql()`select actor, from_status, to_status, body from job_events
    where lead_id = ${id} and kind = 'stage'`;
  expect(events).toEqual([
    {
      actor: ACK_CUSTOMER,
      from_status: "installed",
      to_status: "completed",
      body: "Confirmed the installation from their project page",
    },
  ]);

  await signInOwner(page);
  await page.goto(`/admin/jobs/${id}`);
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]'))
    .toContainText("Completed");
});

/**
 * Spec §8, third journey: a customer reports a fault. A service job appears, the ORIGINAL job
 * stays `installed`, and the review opt-out is set ON THE PARENT.
 *
 * The parent is the point. The review cron asks about the install, which is the parent's; muting
 * the new service job instead would leave the customer who has just said something is wrong
 * being asked for a public review within 14 days, which is the one thing spec §5 forbids. So the
 * child's flag is asserted too — otherwise "muted" could mean the wrong row was muted.
 */
test("a customer reports a fault: a service job appears, the original stays Installed, and the review is muted", async ({ browser }) => {
  const name = `${NAME} Fault`;
  const id = await lead(name, FAULT_CUSTOMER, "installed");

  const customer = await customerPage(browser, FAULT_CUSTOMER);
  await customer.goto(`/project/${id}`);
  await customer.getByRole("region", { name: "Where your project stands" })
    .getByRole("link", { name: "Something is not right" }).click();

  // The marker says which route they came through. It selects the action and nothing else, and
  // the page re-derives it against the job's raw status before it changes a single word.
  await expect(customer).toHaveURL(new RegExp(`/project/${id}/service\\?from=acknowledgement$`));
  await expect(customer.getByText("We are sorry it is not right.")).toBeVisible();

  await customer.getByLabel("Tell us which window or room.").fill("The bedroom shade");
  await customer.getByLabel("What is happening?").selectOption("wont-move");
  await customer.getByRole("button", { name: "Request a service" }).click();
  await expect(customer).toHaveURL(new RegExp(`/project/${id}\\?requested=PSS-\\d{4,}$`));

  // A real job on the owners' board, linked back to the one it came out of.
  const [child] = await sql()`select id, source, status, review_opt_out
    from leads where parent_job_id = ${id}`;
  expect(child).toBeTruthy();
  expect(child.source).toBe("service");
  expect(child.status).toBe("new");

  // The original does NOT move. It stays installed until the owners have put it right — the
  // acknowledgement was "no", and nothing about the install is finished.
  const [parent] = await sql()`select status, review_opt_out from leads where id = ${id}`;
  expect(parent.status).toBe("installed");
  expect(parent.review_opt_out).toBe(true);
  // And it is the parent that was muted, not the new job.
  expect(child.review_opt_out).toBe(false);
  // The mute is logged against the parent in the customer's own name, like every other act
  // they take from this page.
  const [muted] = await sql()`select actor, body from job_events
    where lead_id = ${id} and kind = 'edit' and body = 'Turned off the review request'`;
  expect(muted).toEqual({ actor: FAULT_CUSTOMER, body: "Turned off the review request" });
});

/**
 * THE RELEASE GATE: a customer approving must not move ANY OTHER job.
 *
 * WHY IT CAN FAIL, which is the only thing that makes a gate worth having. `ApproveQuote`
 * renders a plain `<input type="hidden" name="jobId" value={jobId} />` and
 * `approveQuoteFormAction` reads it back with `formData.get("jobId")` — an ordinary field in
 * ordinary FormData, not a bound-and-encrypted argument like `ShareSwitch`'s. A customer can put
 * any id they like in it and the framework will dispatch the action with it, which is exactly
 * the post below. (See the service-request gate above for the same distinction at length.)
 *
 * What stops it is one line in `approveQuoteAction`:
 *
 *     const job = jobs.find((candidate) => candidate.id === jobId);
 *     if (!job) return "not-found";
 *
 * The jobs are re-derived from the session, so an id that is not among them is refused before
 * anything is read or written.
 *
 * HOW TO FALSIFY IT — one edit, no new import. In app/(site)/project/actions.ts, weaken that
 * match so it falls back to the posted id instead of refusing:
 *
 *     const job = jobs.find((candidate) => candidate.id === jobId)
 *       ?? { ...jobs[0], id: jobId, status: "quoted" as const };
 *
 * With that in place the approval is carried out against the bystander's job: the shared quote
 * is found on it, setStage moves it to `sold`, and THIS TEST GOES RED on the status assertion.
 * Restore the line and it goes green again. The controller runs that mutation on a Neon branch
 * before trusting this gate.
 *
 * WHY THE BYSTANDER IS GIVEN A SHARED QUOTE. Without one, the weakened code would be stopped a
 * few lines later by the `no-quote` guard and this test would read green while the ownership
 * check was gone — green for a reason that has nothing to do with the thing it guards. Every
 * other condition on the path is therefore satisfied for the bystander's job, so the ownership
 * check is the only thing left standing between the post and the write.
 *
 * It asserts on the EFFECT in the database, never on a status code: the status, the
 * `stage_changed_at` stamp, and the absence of any new event row. The positive control at the
 * end is what keeps all of that honest — the same form, the same session, the id left alone,
 * must still approve. Otherwise "nothing happened" could quietly mean "approving is broken".
 */
test("a customer approving cannot move another customer's job", async ({ browser }) => {
  const bystanderId = await lead(`${NAME} Bystander`, BYSTANDER_CUSTOMER, "quoted");
  const approverId = await lead(`${NAME} Approver`, APPROVER_CUSTOMER, "quoted");
  await shareQuote(bystanderId, `quote-bystander-${STAMP}.pdf`);
  await shareQuote(approverId, `quote-approver-${STAMP}.pdf`);

  // Read before, compared after: a status that never changed is not enough on its own, because
  // setStage stamps stage_changed_at on every move it makes.
  const [before] = await sql()`select status, stage_changed_at from leads where id = ${bystanderId}`;
  const eventsBefore = await sql()`select id from job_events where lead_id = ${bystanderId}`;

  const approver = await customerPage(browser, APPROVER_CUSTOMER);
  await approver.goto(`/project/${approverId}`);
  const banner = approver.getByRole("region", { name: "Where your project stands" });
  // exact: true — "Approve this quote" is a prefix of the confirm button's "Yes, approve this
  // quote", so a loose match resolves to two elements and the click fails before the gate is
  // ever exercised. A spec that dies here fails identically against correct code.
  await banner.getByText("Approve this quote", { exact: true }).click();
  // The one edit: the hidden field now carries the bystander's job id. Everything else about the
  // post is genuine, so this is the framework's own dispatch reaching the real action.
  await approver.$eval(
    'input[name="jobId"]',
    (element, id) => { (element as HTMLInputElement).value = id; },
    bystanderId,
  );
  await banner.getByRole("button", { name: "Yes, approve this quote" }).click();
  // The action ran: the form's redirect carries the posted id back, and that project is not the
  // approver's, so they land on nothing. Without this the assertions below could pass on a post
  // that never reached the server at all.
  await expect(approver).toHaveURL(new RegExp(`/project/${bystanderId}\\?approved=no$`));
  await expect(approver.getByRole("status")).toHaveCount(0);

  // THE GATE. The bystander's job is untouched in every way the write could have touched it.
  const [after] = await sql()`select status, stage_changed_at from leads where id = ${bystanderId}`;
  expect(after.status).toBe("quoted");
  expect(after.stage_changed_at).toEqual(before.stage_changed_at);
  const eventsAfter = await sql()`select id from job_events where lead_id = ${bystanderId}`;
  expect(eventsAfter).toHaveLength(eventsBefore.length);

  // Nor was it quietly recorded against the approver's own job instead: a refusal that moved
  // the wrong job would be no better than one that moved the bystander's.
  const [own] = await sql()`select status from leads where id = ${approverId}`;
  expect(own.status).toBe("quoted");

  // And the bystander is told nothing on their own page.
  const bystander = await customerPage(browser, BYSTANDER_CUSTOMER);
  await bystander.goto(`/project/${bystanderId}`);
  await expect(bystander.getByRole("region", { name: "Where your project stands" })
    .getByRole("heading", { name: "Quote Ready" })).toBeVisible();

  // THE POSITIVE CONTROL. The same form, the same session, the id left alone: it must approve.
  // If this fails, every refusal above proved nothing about the ownership check.
  await approver.goto(`/project/${approverId}`);
  // exact: true — "Approve this quote" is a prefix of the confirm button's "Yes, approve this
  // quote", so a loose match resolves to two elements and the click fails before the gate is
  // ever exercised. A spec that dies here fails identically against correct code.
  await banner.getByText("Approve this quote", { exact: true }).click();
  await banner.getByRole("button", { name: "Yes, approve this quote" }).click();
  await expect(approver).toHaveURL(new RegExp(`/project/${approverId}\\?approved=1$`));
  const [approved] = await sql()`select status from leads where id = ${approverId}`;
  expect(approved.status).toBe("sold");
  // Still nothing on the bystander's job, after a real approval has demonstrably worked.
  const [untouched] = await sql()`select status from leads where id = ${bystanderId}`;
  expect(untouched.status).toBe("quoted");
});

/**
 * Uploads a PDF, labels it Contract and shares it, through the owner's own controls. Signing
 * fingerprints the bytes actually stored, so every contract below needs a real blob: a row-only
 * fixture would make recordSignature answer not-found for its own reasons, and a refusal could
 * then go green without the guard under test ever deciding anything.
 */
async function shareContract(page: Page, jobId: string, fileName: string): Promise<string> {
  const fileId = await uploadDocument(page, jobId, fileName);
  await page.getByLabel(`Document type for ${fileName}`).selectOption("contract");
  await expect.poll(async () => {
    const [row] = await sql()`select doc_type from job_files where id = ${fileId}`;
    return row.doc_type;
  }).toBe("contract");
  const share = page.getByRole("switch", { name: `Share ${fileName} with customer` });
  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "true");
  return fileId;
}

/**
 * The one form that signs `fileName`. Scoped by the contract's own link, so a page carrying
 * several contracts (and several hidden jobId/fileId fields) never aims at the wrong one.
 */
function signForm(page: Page, fileName: string) {
  const details = page.locator("details", { has: page.getByRole("link", { name: fileName }) });
  return { details, form: details.locator("form", { has: page.getByLabel("Your full name") }) };
}

/** Opens the contract's form, types a name and ticks the box: what a customer does. */
async function fillAndSign(page: Page, fileName: string, typedName: string) {
  const { details, form } = signForm(page, fileName);
  await details.locator("summary").click();
  await form.getByLabel("Your full name").fill(typedName);
  await form.getByLabel("I agree to sign this contract electronically").check();
  return form;
}

/** Points one hidden field of ONE form elsewhere — the only edit a forged post makes. */
async function forge(form: Locator, field: "jobId" | "fileId", value: string) {
  await form.locator(`input[name="${field}"]`).evaluate(
    (element, next) => { (element as HTMLInputElement).value = next; },
    value,
  );
}

/** Signing stamps its copy in after(), once the response has gone; wait for it to land. */
async function stampedCopyOf(fileId: string): Promise<string> {
  let signedFileId: string | null = null;
  await expect.poll(async () => {
    const [row] = await sql()`select signed_file_id from contract_signatures where file_id = ${fileId}`;
    signedFileId = (row?.signed_file_id as string | null) ?? null;
    return signedFileId;
  }, { timeout: 20_000 }).not.toBeNull();
  return signedFileId!;
}

test("a customer signs a shared contract and keeps a stamped copy", async ({ page, browser }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run document tests");

  const id = await lead(`${NAME} Signer`, SIGNER_CUSTOMER, "sold");
  const fileName = `contract-signer-${STAMP}.pdf`;
  await signInOwner(page);
  const fileId = await shareContract(page, id, fileName);

  const customer = await customerPage(browser, SIGNER_CUSTOMER);
  await customer.goto(`/project/${id}`);
  await expect(customer.getByRole("heading", { name: "Your contract" })).toBeVisible();
  const form = await fillAndSign(customer, fileName, "Pat Signer");
  await form.getByRole("button", { name: "Sign this contract" }).click();

  await expect(customer).toHaveURL(new RegExp(`/project/${id}\\?signed=1&file=${fileId}$`));
  await expect(customer.getByRole("status")).toContainText("Thank you — your contract was signed on");
  // Nothing left to sign: the form is gone, and so is its section.
  await expect(customer.getByLabel("Your full name")).toHaveCount(0);
  await expect(customer.getByRole("heading", { name: "Your contract" })).toHaveCount(0);

  // The record: one row, the session's email (never anything the form sent), a fingerprint of
  // the served bytes, and the stamped copy linked to it.
  const rows = await sql()`select lead_id, signed_name, signed_email, doc_sha256
    from contract_signatures where file_id = ${fileId}`;
  expect(rows).toHaveLength(1);
  expect(rows[0].lead_id).toBe(id);
  expect(rows[0].signed_name).toBe("Pat Signer");
  expect(rows[0].signed_email).toBe(SIGNER_CUSTOMER);
  expect(rows[0].doc_sha256).toMatch(/^[0-9a-f]{64}$/);
  const signedFileId = await stampedCopyOf(fileId);

  // The stamped copy is the customer's to download — the PDF, not a sign-in page wearing a 200.
  expectFile(await download(customer, `/project/files/${signedFileId}`), "application/pdf");

  // The owners' timeline names the document, never the typed name.
  await page.goto(`/admin/jobs/${id}?tab=activity`);
  await expect(page.getByText(`Signed "${fileName}" from their project page`)).toBeVisible();
  const events = await sql()`select actor, body from job_events where lead_id = ${id} and kind = 'signature'`;
  expect(events).toEqual([{ actor: SIGNER_CUSTOMER, body: `Signed "${fileName}" from their project page` }]);
});

test("a signature output is never offered for signing, and a post naming it is refused", async ({ page, browser }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run document tests");

  const id = await lead(`${NAME} Signer Output`, OUTPUT_CUSTOMER, "sold");
  const first = `contract-output-a-${STAMP}.pdf`;
  const second = `contract-output-b-${STAMP}.pdf`;
  await signInOwner(page);
  const firstId = await shareContract(page, id, first);
  const secondId = await shareContract(page, id, second);

  const customer = await customerPage(browser, OUTPUT_CUSTOMER);
  await customer.goto(`/project/${id}`);
  const sign = await fillAndSign(customer, first, "Pat Output");
  await sign.getByRole("button", { name: "Sign this contract" }).click();
  await expect(customer).toHaveURL(new RegExp(`\\?signed=1&file=${firstId}$`));
  const stampedId = await stampedCopyOf(firstId);

  // The stamped copy is itself a shared contract, and so is the unsigned second one — yet exactly
  // one form renders, and it is the second contract's.
  const [stamped] = await sql()`select shared_at, doc_type from job_files where id = ${stampedId}`;
  expect(stamped.shared_at).not.toBeNull();
  expect(stamped.doc_type).toBe("contract");
  await customer.goto(`/project/${id}`);
  await expect(customer.getByLabel("Your full name")).toHaveCount(1);
  await expect(signForm(customer, second).form).toHaveCount(1);

  // The forgery: the second contract's own genuine form, its fileId pointed at the stamped copy.
  const form = await fillAndSign(customer, second, "Pat Output");
  await forge(form, "fileId", stampedId);
  await form.getByRole("button", { name: "Sign this contract" }).click();
  // The action ran and refused: the redirect carries the posted id back, answered no.
  await expect(customer).toHaveURL(new RegExp(`/project/${id}\\?signed=no&file=${stampedId}$`));
  await expect(customer.getByRole("status")).toContainText("We could not record that signature just now.");

  // Nothing was written: no signature on the copy, and the second contract is still unsigned.
  expect(await sql()`select id from contract_signatures where file_id = ${stampedId}`).toHaveLength(0);
  expect(await sql()`select id from contract_signatures where file_id = ${secondId}`).toHaveLength(0);
  expect(await sql()`select id from contract_signatures where lead_id = ${id}`).toHaveLength(1);
  await expect(signForm(customer, second).form).toHaveCount(1);
});

test.describe("signed contract security gates", () => {
  // Checked once per run, before either gate runs, exactly as the file isolation gate above:
  // both need a real blob, and a security gate that quietly skips reads GREEN while proving
  // nothing. A missing token fails loudly here. The two signing feature specs above still skip.
  test.beforeAll(() => {
    if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "E2E_BLOB_READ_WRITE_TOKEN is not set. The signed-contract security gates must actually run — " +
          "set the token against the test blob store rather than skipping them.",
      );
    }
  });

/**
 * The owners' controls disappear from a signed contract, so the refusal underneath can only be
 * reached from a page loaded BEFORE the signature: its forms still carry the framework's own,
 * genuine unshare and delete actions for that file. Each stale tab posts one of them after the
 * customer signs, and the database must refuse both.
 */
test("a signed contract is frozen: unsharing and deleting it both fail", async ({ page, browser }) => {
  const id = await lead(`${NAME} Frozen`, FROZEN_CUSTOMER, "sold");
  const fileName = `contract-frozen-${STAMP}.pdf`;
  await signInOwner(page);
  const fileId = await shareContract(page, id, fileName);

  // Two owner tabs, opened while the contract is still unsigned and its controls still render.
  const staleUnshare = await page.context().newPage();
  await staleUnshare.goto(`/admin/jobs/${id}?tab=files`);
  const unshare = staleUnshare.getByRole("switch", { name: `Share ${fileName} with customer` });
  await expect(unshare).toHaveAttribute("aria-checked", "true");
  const staleDelete = await page.context().newPage();
  await staleDelete.goto(`/admin/jobs/${id}?tab=files`);
  const row = staleDelete.getByRole("listitem").filter({ has: staleDelete.getByRole("link", { name: fileName }) });
  await expect(row.getByRole("button", { name: "Delete" })).toBeVisible();

  const customer = await customerPage(browser, FROZEN_CUSTOMER);
  await customer.goto(`/project/${id}`);
  const form = await fillAndSign(customer, fileName, "Pat Frozen");
  await form.getByRole("button", { name: "Sign this contract" }).click();
  await expect(customer).toHaveURL(new RegExp(`\\?signed=1&file=${fileId}$`));
  const signedFileId = await stampedCopyOf(fileId);

  // Unshare, through the stale tab's genuine action. The action revalidates the page, which then
  // re-renders without the switch — proof the post reached the server.
  await unshare.click();
  await expect(staleUnshare.getByRole("switch", { name: `Share ${fileName} with customer` })).toHaveCount(0);

  // Delete, through the other stale tab: two taps, as an owner does it.
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: "Tap again to delete" }).click();
  await expect(row.getByText("Signed — kept as the record")).toBeVisible();

  // Both refused: the contract and its stamped copy still exist and are still shared.
  const files = await sql()`select id, shared_at from job_files where id = any(${[fileId, signedFileId]})`;
  expect(files).toHaveLength(2);
  for (const file of files) expect(file.shared_at).not.toBeNull();

  // What the owners see now: the record, with no controls on either file.
  await page.goto(`/admin/jobs/${id}?tab=files`);
  await expect(page.getByText("Signed — kept as the record")).toHaveCount(2);
  await expect(page.getByRole("switch", { name: `Share ${fileName} with customer` })).toHaveCount(0);

  // And the customer can still open both.
  expectFile(await download(customer, `/project/files/${fileId}`), "application/pdf");
  expectFile(await download(customer, `/project/files/${signedFileId}`), "application/pdf");
});

/**
 * THE RELEASE GATE for signing: one customer's session must not be able to sign another
 * customer's contract.
 *
 * The bystander's contract is real — uploaded, labelled, shared, with a blob behind it — so if
 * the ownership check were weakened nothing else would stop the signature: signableContracts
 * would list it and recordSignature would fingerprint it. The gate cannot go green because some
 * other guard happened to refuse. It asserts on database effect, and ends with a positive control
 * proving the same form in the same session does sign.
 *
 * Needs E2E_BLOB_READ_WRITE_TOKEN for that reason. Never skipped: the describe's beforeAll throws
 * without it, because a skipped gate proves nothing.
 */
test("a customer signing cannot reach another customer's contract", async ({ page, browser }) => {
  const bystanderId = await lead(`${NAME} Sign Bystander`, SIGN_BYSTANDER, "sold");
  const attackerId = await lead(`${NAME} Sign Attacker`, SIGN_ATTACKER, "sold");
  const bystanderName = `contract-bystander-${STAMP}.pdf`;
  const attackerName = `contract-attacker-${STAMP}.pdf`;
  await signInOwner(page);
  const bystanderFileId = await shareContract(page, bystanderId, bystanderName);
  const attackerFileId = await shareContract(page, attackerId, attackerName);
  const eventsBefore = await sql()`select id from job_events where lead_id = ${bystanderId}`;

  const attacker = await customerPage(browser, SIGN_ATTACKER);
  await attacker.goto(`/project/${attackerId}`);
  const form = await fillAndSign(attacker, attackerName, "Mallory");
  // The one edit: both hidden fields, in THIS form, now name the bystander's job and contract.
  // Everything else is genuine, so this is the framework's own dispatch reaching the real action.
  await forge(form, "jobId", bystanderId);
  await forge(form, "fileId", bystanderFileId);
  await form.getByRole("button", { name: "Sign this contract" }).click();
  // The action ran: its redirect carries the posted ids back, answered no.
  await expect(attacker).toHaveURL(new RegExp(`/project/${bystanderId}\\?signed=no&file=${bystanderFileId}$`));

  // THE GATE: no signature on the bystander's contract or job, and no timeline row.
  expect(await sql()`select id from contract_signatures where file_id = ${bystanderFileId}`).toHaveLength(0);
  expect(await sql()`select id from contract_signatures where lead_id = ${bystanderId}`).toHaveLength(0);
  expect(await sql()`select id from job_events where lead_id = ${bystanderId}`).toHaveLength(eventsBefore.length);
  // Nor recorded against the attacker's own job instead.
  expect(await sql()`select id from contract_signatures where lead_id = ${attackerId}`).toHaveLength(0);

  // The bystander still has their contract to sign.
  const bystander = await customerPage(browser, SIGN_BYSTANDER);
  await bystander.goto(`/project/${bystanderId}`);
  await expect(signForm(bystander, bystanderName).form).toHaveCount(1);

  // THE POSITIVE CONTROL. Same form, same session, ids left alone: it must sign. If this fails,
  // every refusal above proved nothing about the ownership check.
  await attacker.goto(`/project/${attackerId}`);
  const own = await fillAndSign(attacker, attackerName, "Mallory");
  await own.getByRole("button", { name: "Sign this contract" }).click();
  await expect(attacker).toHaveURL(new RegExp(`/project/${attackerId}\\?signed=1&file=${attackerFileId}$`));
  const signed = await sql()`select lead_id, signed_email from contract_signatures where file_id = ${attackerFileId}`;
  expect(signed).toEqual([{ lead_id: attackerId, signed_email: SIGN_ATTACKER }]);
  // Still nothing on the bystander's, after a real signature has demonstrably worked.
  expect(await sql()`select id from contract_signatures where lead_id = ${bystanderId}`).toHaveLength(0);
});
});

test("a lost job locks the customer out", async ({ browser }) => {
  const page = await customerPage(browser);
  await sql()`update leads set status = 'lost' where id = ${jobId}`;
  await page.reload();
  await expect(page).toHaveURL(/\/project\/sign-in$/);
});

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
const MSG_CUSTOMER = `e2e-customer-msg-${STAMP}@example.com`;
const SERVICE_CUSTOMER = `e2e-customer-service-${STAMP}@example.com`;
// Two jobs on one email, deliberately: this customer is the "Your projects" list.
const LIST_CUSTOMER = `e2e-customer-list-${STAMP}@example.com`;
// The release gate's two sides: one customer who files the request, one whose job is named.
const GATE_CUSTOMER = `e2e-customer-gate-${STAMP}@example.com`;
const VICTIM_CUSTOMER = `e2e-customer-victim-${STAMP}@example.com`;

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

let jobId: string;

test.beforeAll(async () => {
  if (!url) return;
  jobId = await lead(NAME, CUSTOMER, "quoted");
});

test.afterAll(async () => {
  if (!url) return;
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
  await attacker.$eval(
    'input[name="jobId"]',
    (element, id) => { (element as HTMLInputElement).value = id; },
    victimId,
  );
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

test("a lost job locks the customer out", async ({ browser }) => {
  const page = await customerPage(browser);
  await sql()`update leads set status = 'lost' where id = ${jobId}`;
  await page.reload();
  await expect(page).toHaveURL(/\/project\/sign-in$/);
});

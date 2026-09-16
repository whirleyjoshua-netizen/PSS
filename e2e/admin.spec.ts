import path from "node:path";
import { test, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin tests");

// This file's own cleanup runs once per worker (afterAll), so running it in
// parallel across workers/projects races: one worker can delete the rows
// another worker's test still depends on. Run serially, desktop only.
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const NAME = `E2E Tracker ${Date.now()}`;

/**
 * Fetches a file as the owner's own browser would.
 *
 * NOT `page.request.get`: the `pss_admin` session cookie is `Secure` (the e2e server
 * runs a production build) and Playwright's APIRequestContext does not send it over
 * plain http, so such a request arrives signed out, is redirected to /admin/sign-in
 * and comes back 200 text/html — an assertion that would pass with the file route
 * deleted. Fetching from inside the page carries the real session.
 * `redirect: "manual"` keeps a bounce to sign-in from masquerading as a 200.
 */
async function download(page: import("@playwright/test").Page, target: string) {
  return page.evaluate(async (fileUrl) => {
    const response = await fetch(fileUrl, { redirect: "manual" });
    const body = response.type === "opaqueredirect" ? "" : (await response.text()).slice(0, 200);
    return {
      status: response.status,
      type: response.headers.get("content-type") ?? "",
      html: /^\s*<(!doctype|html)/i.test(body),
    };
  }, target);
}

async function signIn(page: import("@playwright/test").Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash}, 'e2e-owner@example.com', now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

test.afterAll(async () => {
  if (url) {
    await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Tracker %')`;
    await sql()`delete from leads where name like 'E2E Tracker %'`;
    await sql()`delete from admin_login_tokens where email = 'e2e-owner@example.com'`;
    await sql()`delete from admin_sessions where email = 'e2e-owner@example.com'`;
  }
});

test("an admin page without a session goes to sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
});

test("a used sign-in link is refused", async ({ page }) => {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at, used_at)
    values (${hash}, 'e2e-owner@example.com', now() + interval '15 minutes', now())`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Next's route announcer is also role="alert", so find the page's own alert by its message.
  await expect(page.getByRole("alert").filter({ hasText: /expired or was already used/i })).toBeVisible();
});

test("opening the sign-in link alone does not use it", async ({ page }) => {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash}, 'e2e-owner@example.com', now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await expect(page.getByRole("heading", { name: "Sign in to the PSS job tracker" })).toBeVisible();

  const rows = await sql()`select used_at from admin_login_tokens where token_hash = ${hash}`;
  expect(rows[0].used_at).toBeNull();
});

test("an owner adds a job, advances it, and leaves a note", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "New job", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(NAME);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0134");
  await page.getByRole("button", { name: "Add job" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  await page.getByLabel("More actions").click();
  await page.getByText("Change stage…").click();
  await page.getByLabel("Set stage").selectOption("visit_booked");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");

  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await page.getByLabel("Add a note").fill("Call back after 5pm");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Call back after 5pm")).toBeVisible();
  await expect(page.getByText("New lead → Appointment booked")).toBeVisible();

  await page.getByRole("link", { name: "← All jobs" }).click();
  await expect(page.getByRole("region", { name: /appointment booked/i }).getByRole("link", { name: new RegExp(NAME) })).toBeVisible();
});

test("a referral link attributes the friend and the reward can be paid", async ({ page }) => {
  const referrerName = `E2E Tracker Referrer ${Date.now()}`;
  const friendName = `E2E Tracker Friend ${Date.now()}`;
  const code = `E${String(Date.now()).slice(-5).replace(/[01]/g, "9")}`;
  await sql()`insert into leads (name, phone, email, city, source, status, referral_code)
    values (${referrerName}, '7025550100', 'e2e-referrer@example.com', 'Henderson', 'phone', 'installed', ${code})`;

  await page.goto(`/r/${code.toLowerCase()}`);
  await expect(page).toHaveURL(/\/contact\?ref=friend/);
  await expect(page.getByText("E2E sent you.")).toBeVisible();
  await expect(page.getByLabel(/how did you hear/i)).toHaveValue("Referral from a friend");

  await page.getByLabel("Name", { exact: true }).fill(friendName);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0101");
  await page.getByLabel("Email", { exact: true }).fill("e2e-friend@example.com");
  await page.getByRole("button", { name: /request free consultation/i }).click();
  await expect(page).toHaveURL(/\/thank-you$/);

  await signIn(page);
  const [referrer] = await sql()`select id from leads where referral_code = ${code}`;
  await page.goto(`/admin/jobs/${referrer.id}`);
  await expect(page.getByRole("link", { name: friendName })).toBeVisible();
  await expect(page.getByText("Pending")).toBeVisible();

  await page.getByRole("link", { name: friendName }).click();
  await expect(page.getByRole("link", { name: referrerName })).toBeVisible();
  await page.getByLabel("More actions").click();
  await page.getByText("Change stage…").click();
  await page.getByLabel("Set stage").selectOption("installed");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Installed");

  await page.getByRole("link", { name: referrerName }).click();
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText(/^Paid /)).toBeVisible();
  await expect(page.getByText(`Referral reward paid for ${friendName}`)).toBeVisible();
});

test("an owner measures a window with a photo", async ({ page, baseURL }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run photo upload tests");

  const name = `${NAME} Measure`;
  await signIn(page);

  await page.getByRole("link", { name: "New job", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0135");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  await page.getByRole("link", { name: "Add measurement" }).click();
  await page.getByRole("button", { name: "Kitchen" }).click();
  await page.getByLabel("Width inches").fill("35");
  await page.getByLabel("Width eighths").selectOption({ label: "⅝" });
  await page.getByLabel("Height inches").fill("48");
  await page.getByLabel("Inside").check();
  await page.locator('input[name="photo"]').setInputFiles(path.join(__dirname, "fixtures", "window.jpg"));
  await page.getByRole("button", { name: "Save and next window" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.getByRole("link", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page).toHaveURL(/\?tab=measurements$/);
  const row = page.getByRole("row", { name: /Kitchen/ });
  await expect(row).toContainText("35 ⅝″");
  await expect(row).toContainText("48″");

  const photo = page.locator('img[src^="/admin/files/"]');
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute("src");
  const photoUrl = `${baseURL}${src}`;

  const okResponse = await download(page, photoUrl);
  expect(okResponse.status).toBe(200);
  expect(okResponse.type).toContain("image/jpeg");
  // The bytes of a photo, not a sign-in page wearing a 200.
  expect(okResponse.html).toBe(false);

  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Width inches")).toHaveValue("35");
  await expect(page.getByLabel(/^Room/)).toHaveValue("Kitchen");
  await page.getByLabel("Height inches").fill("50");
  await page.getByRole("button", { name: "Save window" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("row", { name: /Kitchen/ })).toContainText("50″");
  const editedRow = page.getByRole("row", { name: /Kitchen/ });
  await editedRow.getByRole("button", { name: "Delete" }).click();
  await editedRow.getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page.getByText("No windows measured yet.")).toBeVisible();

  // A 404 from the route itself, not a redirect to sign-in.
  const goneResponse = await download(page, photoUrl);
  expect(goneResponse.status).toBe(404);
  expect(goneResponse.html).toBe(false);
});

test("a board card opens the full job page, and an old ?job= link redirects there", async ({ page }) => {
  const name = `E2E Tracker Panel ${Date.now()}`;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550102', 'e2e-panel@example.com', 'Henderson', 'phone', 'quoted')
    returning id`;

  await signIn(page);
  // The All jobs list under the board has a link with the same name; open the board card.
  await page.getByRole("region", { name: "Board" }).getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${row.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  // Nothing opens beside the board any more, at any width.
  await expect(page.getByRole("complementary", { name: new RegExp(name) })).toHaveCount(0);

  // Bookmarks and already-sent calendar invites still carry the old URL.
  await page.goto(`/admin?job=${row.id}`);
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${row.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
});

test("search finds a job, and a column's add button starts a job in that stage", async ({ page }) => {
  const name = `E2E Tracker Search ${Date.now()}`;
  await signIn(page);

  await page.getByRole("region", { name: /quoted/i }).getByRole("link", { name: "+ Add job" }).click();
  await expect(page.getByRole("heading", { name: "New job · Quoted" })).toBeVisible();
  await expect(page.getByLabel("Stage")).toHaveValue("quoted");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0177");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Quoted");

  await page.goto("/admin");
  await page.getByRole("searchbox", { name: "Search jobs" }).fill("555 0177");
  await page.getByRole("searchbox", { name: "Search jobs" }).press("Enter");
  await expect(page).toHaveURL(/\/admin\?q=555/);
  await expect(page.getByRole("region", { name: /quoted/i }).getByRole("link", { name: new RegExp(name) })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search jobs" }).fill(name.slice(-8));
  await page.getByRole("searchbox", { name: "Search jobs" }).press("Enter");
  await expect(page.getByRole("region", { name: /quoted/i }).getByRole("link", { name: new RegExp(name) })).toBeVisible();
});

test("the schedule shows this week's visits from the tracker and opens the full job page", async ({ page }) => {
  const visit = new Date(Date.now() + 60 * 60 * 1000); // an hour from now is always this week or just into next
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status, visit_at)
    values (${`${NAME} Schedule`}, '7025550188', 'sched@example.com', 'Henderson', 'phone', 'visit_booked', ${visit})
    returning id`;
  // The Schedule page reads confirmed appointments, not leads.visit_at, which is only a mirror.
  await sql()`insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
    values (${row.id}, 'consultation', ${visit}, false, now(), 'e2e')`;
  await signIn(page);
  // Visiting the week that contains the visit keeps this stable on a Saturday night.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(visit);
  await page.goto(`/admin/schedule?week=${day}`);
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Outlook isn't connected yet." })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`${NAME} Schedule`) }).click();
  // The schedule never opens the board panel, at any width: it goes to the full job page.
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${row.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${NAME} Schedule`);
  await expect(page.getByRole("complementary", { name: new RegExp(`${NAME} Schedule`) })).toHaveCount(0);
});

test("the schedule's month view shows a day's visit and opens the full job page", async ({ page }) => {
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(future);
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status, visit_at)
    values (${`${NAME} Month`}, '7025550189', 'sched-month@example.com', 'Henderson', 'phone', 'visit_booked',
      ${`${day} 10:00 America/Los_Angeles`}::timestamptz)
    returning id`;
  // The Schedule page reads confirmed appointments, not leads.visit_at, which is only a mirror.
  await sql()`insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
    values (${row.id}, 'consultation', ${`${day} 10:00 America/Los_Angeles`}::timestamptz, false, now(), 'e2e')`;
  await signIn(page);
  await page.goto("/admin/schedule");
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/view=month/);
  const month = day.slice(0, 7);
  await page.goto(`/admin/schedule?view=month&month=${month}`);
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  const cellName = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const cell = page.getByRole("link", { name: new RegExp(`^${cellName}, \\d+ booked`) });
  await cell.click();
  const dayHeading = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
  const section = page.getByRole("region", { name: dayHeading });
  await expect(section.getByRole("link", { name: new RegExp(`${NAME} Month`) })).toBeVisible();
  await section.getByRole("link", { name: new RegExp(`${NAME} Month`) }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${row.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${NAME} Month`);
  await expect(page.getByRole("complementary", { name: new RegExp(`${NAME} Month`) })).toHaveCount(0);
});

test("the call screen shows that day's calendar and flags a clash", async ({ page }) => {
  const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(future);
  const [booked] = await sql()`insert into leads (name, phone, email, city, source, status, visit_at)
    values (${`${NAME} Booked`}, '7025550190', 'e2e-booked@example.com', 'Henderson', 'phone', 'visit_booked',
      ${`${day} 10:00 America/Los_Angeles`}::timestamptz)
    returning id`;
  // The call screen's day calendar reads confirmed appointments, not leads.visit_at.
  await sql()`insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
    values (${booked.id}, 'consultation', ${`${day} 10:00 America/Los_Angeles`}::timestamptz, false, now(), 'e2e')`;
  const [toCall] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${`${NAME} ToCall`}, '7025550191', 'e2e-tocall@example.com', 'Henderson', 'phone', 'quoted')
    returning id`;

  await signIn(page);
  await page.goto(`/admin/jobs/${toCall.id}/call`);
  await page.getByRole("button", { name: "Booked a visit" }).click();
  await page.getByLabel("Visit date and time").fill(`${day}T10:30`);

  const panel = page.locator("#call-day-heading").locator("xpath=..");
  await expect(panel.getByText("clashes with this time")).toBeVisible();
  await expect(panel.getByText("Outlook isn't connected yet.")).toBeVisible();

  await page.getByLabel("Visit date and time").fill(`${day}T13:00`);
  await expect(panel.getByText("clashes with this time")).toHaveCount(0);
});

import { test, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin tests");

// Shares a sign-in email and cleanup shape with admin.spec.ts, so it runs serially
// for the same reason. Its rows use their own prefix so the two files' afterAll
// cleanups can never delete each other's data when the projects run in parallel.
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const NAME = `E2E Mobile ${Date.now()}`;

async function signIn(page: import("@playwright/test").Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash}, 'e2e-mobile@example.com', now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

test.afterAll(async () => {
  if (url) {
    await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Mobile %')`;
    await sql()`delete from leads where name like 'E2E Mobile %'`;
    await sql()`delete from admin_login_tokens where email = 'e2e-mobile@example.com'`;
    await sql()`delete from admin_sessions where email = 'e2e-mobile@example.com'`;
  }
});

/** One quoted job, so it lands in a known board column and in the All jobs list. */
async function makeJob(suffix: string) {
  const name = `${NAME} ${suffix}`;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550311', 'e2e-mobile@example.com', 'Henderson', 'phone', 'quoted')
    returning id`;
  return { name, id: row.id as string };
}

test("a board card opens the full job page, not the panel", async ({ page }) => {
  const { name, id } = await makeJob("Card");
  await signIn(page);

  await page.getByRole("region", { name: "Board" }).getByRole("link", { name: new RegExp(name) }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  // The half profile is desktop-only; on a phone it must not appear at all.
  await expect(page.getByRole("complementary", { name: new RegExp(name) })).toHaveCount(0);
});

test("an All jobs row opens the full job page, not the panel", async ({ page }) => {
  const { name, id } = await makeJob("Row");
  await signIn(page);

  await page.getByRole("region", { name: /all jobs/i }).getByRole("link", { name: new RegExp(name) }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("complementary", { name: new RegExp(name) })).toHaveCount(0);
});

test("a stale ?job= link shows the board with no panel", async ({ page }) => {
  const { name, id } = await makeJob("Stale");
  await signIn(page);

  // Old bookmarks and already-sent calendar invites still carry this URL.
  await page.goto(`/admin?job=${id}`);

  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: new RegExp(name) })).toHaveCount(0);
});

test("the schedule opens the full job page", async ({ page }) => {
  const visit = new Date(Date.now() + 60 * 60 * 1000);
  const name = `${NAME} Sched`;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status, visit_at)
    values (${name}, '7025550312', 'e2e-mobile@example.com', 'Henderson', 'phone', 'visit_booked', ${visit})
    returning id`;
  await signIn(page);

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(visit);
  await page.goto(`/admin/schedule?week=${day}`);
  await page.getByRole("link", { name: new RegExp(name) }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${row.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
});

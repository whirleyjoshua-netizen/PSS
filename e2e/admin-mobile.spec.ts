import { test, expect, type BrowserContext } from "@playwright/test";
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
    await sql()`delete from admin_passkeys where email = 'e2e-mobile@example.com'`;
    await sql()`delete from admin_webauthn_challenges where email = 'e2e-mobile@example.com'`;
    if (signInChallenges.size > 0) {
      await sql()`delete from admin_webauthn_challenges where id = any(${[...signInChallenges]})`;
    }
  }
});

/**
 * Sign-in challenges carry no address, so they are found by the id in the browser's challenge
 * cookie. The sign-in page prefetches one on load; signing in by code leaves it unused.
 */
const signInChallenges = new Set<string>();
async function rememberChallenges(context: BrowserContext) {
  for (const cookie of await context.cookies()) {
    if (cookie.name === "pss_webauthn_signin" || cookie.name === "pss_webauthn_reg") signInChallenges.add(cookie.value);
  }
}

test("signs in with the emailed code", async ({ page, context }) => {
  const email = "e2e-mobile@example.com";
  // Earlier rows for this address count toward the 5-per-hour limit and would compete as "newest".
  await sql()`delete from admin_login_tokens where email = ${email}`;
  const [{ now: before }] = await sql()`select now() as now`;

  await page.goto("/admin/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("a sign-in code and link are on their way");

  // The row is written in after(), once the response has gone. No email leaves e2e, so the code is
  // set to a known one: the same hash lib/admin/login.ts stores, sha256 of "email:code".
  let tokenHash: string | undefined;
  await expect
    .poll(
      async () => {
        const rows = await sql()`select token_hash from admin_login_tokens
          where email = ${email} and created_at >= ${before} and code_hash is not null
          order by created_at desc limit 1`;
        tokenHash = rows[0]?.token_hash as string | undefined;
        return tokenHash;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  const known = createHash("sha256").update(`${email}:123456`).digest("hex");
  await sql()`update admin_login_tokens set code_hash = ${known} where token_hash = ${tokenHash!}`;

  await page.getByLabel("6-digit code").fill("123456");
  // Exact: on a phone with passkeys the page also has "Sign in with Face ID".
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await rememberChallenges(context);

  // The code is used up: the row is marked used, so the same code cannot sign in twice.
  const [row] = await sql()`select used_at from admin_login_tokens where token_hash = ${tokenHash!}`;
  expect(row.used_at).not.toBeNull();
});

test("the app manifest and iOS tags are on admin pages only", async ({ page, request, context }) => {
  const response = await request.get("/ops.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe("PSS Ops");
  expect(manifest.start_url).toBe("/admin");
  expect(manifest.display).toBe("standalone");

  await page.goto("/admin/sign-in");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/ops.webmanifest");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "PSS Ops");
  // Once its Face ID options have landed, the page's sign-in challenge id is in the cookie.
  await expect(page.getByRole("button", { name: "Sign in with Face ID" })).toBeEnabled();
  await rememberChallenges(context);

  // The public site is not the app: "Add to Home Screen" there must not install PSS Ops.
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveCount(0);
});

test("refresh keeps the menu closed", async ({ page }) => {
  await signIn(page);
  const menu = page.locator("details.admin-sidebar");
  const refresh = menu.getByRole("button", { name: "Refresh" });

  await refresh.click();
  // It finishes ("Refreshing…" back to "Refresh") with the menu still shut and its links hidden.
  await expect(refresh).toHaveText("Refresh");
  await expect(refresh).toBeEnabled();
  await expect(menu).not.toHaveAttribute("open", /.*/);
  await expect(menu.getByRole("link", { name: "Schedule" })).toBeHidden();
  await expect(menu.getByRole("button", { name: /Sign out/ })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
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
  // The half profile is gone entirely; nothing opens beside the board.
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

test("an old ?job= link redirects to the full job page", async ({ page }) => {
  const { name, id } = await makeJob("Stale");
  await signIn(page);

  // Old bookmarks and already-sent calendar invites still carry this URL.
  await page.goto(`/admin?job=${id}`);

  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
});

test("the schedule opens the full job page", async ({ page }) => {
  const visit = new Date(Date.now() + 60 * 60 * 1000);
  const name = `${NAME} Sched`;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status, visit_at)
    values (${name}, '7025550312', 'e2e-mobile@example.com', 'Henderson', 'phone', 'visit_booked', ${visit})
    returning id`;
  // The Schedule page reads confirmed appointments, not leads.visit_at, which is only a mirror.
  await sql()`insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
    values (${row.id}, 'consultation', ${visit}, false, now(), 'e2e')`;
  await signIn(page);

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(visit);
  await page.goto(`/admin/schedule?week=${day}`);
  await page.getByRole("link", { name: new RegExp(name) }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${row.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
});

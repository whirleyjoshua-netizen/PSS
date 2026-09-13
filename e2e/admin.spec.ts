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

async function signIn(page: import("@playwright/test").Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash}, 'e2e-owner@example.com', now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
}

test.afterAll(async () => {
  if (url) {
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
  await expect(page.getByRole("alert")).toContainText(/expired or was already used/i);
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

  await page.getByRole("link", { name: "New job" }).click();
  await page.getByLabel("Name", { exact: true }).fill(NAME);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0134");
  await page.getByRole("button", { name: "Add job" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  await page.getByRole("button", { name: "Move to Contacted" }).click();
  await expect(page.getByText("Stage:")).toContainText("Contacted");

  await page.getByLabel("Add a note").fill("Call back after 5pm");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Call back after 5pm")).toBeVisible();
  await expect(page.getByText("New lead → Contacted")).toBeVisible();

  await page.getByRole("link", { name: "← All jobs" }).click();
  await expect(page.getByRole("region", { name: /contacted/i }).getByRole("link", { name: new RegExp(NAME) })).toBeVisible();
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
  await page.getByLabel("Set stage").selectOption("installed");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByText("Stage:")).toContainText("Installed");

  await page.getByRole("link", { name: referrerName }).click();
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText(/^Paid /)).toBeVisible();
  await expect(page.getByText(`Referral reward paid for ${friendName}`)).toBeVisible();
});

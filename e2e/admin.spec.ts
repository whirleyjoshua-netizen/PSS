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

test("an owner measures a window with a photo", async ({ page, baseURL }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run photo upload tests");

  const name = `${NAME} Measure`;
  await signIn(page);

  await page.getByRole("link", { name: "New job" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0135");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  await page.getByRole("link", { name: "Measure" }).click();
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
  await expect(page.getByText("Kitchen")).toBeVisible();
  await expect(page.getByText("35 ⅝″ × 48″")).toBeVisible();

  const photo = page.locator('img[src^="/admin/files/"]');
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute("src");
  const photoUrl = `${baseURL}${src}`;

  const okResponse = await page.request.get(photoUrl);
  expect(okResponse.status()).toBe(200);
  expect(okResponse.headers()["content-type"]).toContain("image/jpeg");

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No windows measured yet.")).toBeVisible();

  const goneResponse = await page.request.get(photoUrl);
  expect(goneResponse.status()).toBe(404);
});

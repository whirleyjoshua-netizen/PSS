import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run portal tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const NAME = `E2E Portal ${Date.now()}`;
const CUSTOMER = `e2e-customer-${Date.now()}@example.com`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function signInOwner(page: Page) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, 'e2e-owner@example.com', now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
}

async function customerPage(browser: Browser): Promise<Page> {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into customer_login_tokens (token_hash, email, expires_at)
    values (${hash(token)}, ${CUSTOMER}, now() + interval '15 minutes')`;
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/project/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/project$/);
  return page;
}

let jobId: string;

test.beforeAll(async () => {
  if (!url) return;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${NAME}, '7025550150', ${CUSTOMER}, 'Henderson', 'phone', 'quoted') returning id`;
  jobId = row.id as string;
});

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from job_files where lead_id in (select id from leads where name like 'E2E Portal %')`;
  await sql()`delete from leads where name like 'E2E Portal %'`;
  await sql()`delete from customer_login_tokens where email like 'e2e-customer-%'`;
  await sql()`delete from customer_sessions where email like 'e2e-customer-%'`;
  await sql()`delete from admin_login_tokens where email = 'e2e-owner@example.com'`;
  await sql()`delete from admin_sessions where email = 'e2e-owner@example.com'`;
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

test("a customer sees their progress and referral link, with no money", async ({ browser }) => {
  await sql()`update leads set quote_cents = 450000 where id = ${jobId}`;
  const page = await customerPage(browser);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi E2E");
  await expect(page.locator('li[aria-current="step"]')).toContainText("Quote ready");
  await expect(page.getByText("Photos from your install will appear here.")).toBeVisible();
  await expect(page.getByText(/\/r\/[A-Z2-9]{6}$/)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("4,500");
});

test("a shared photo appears for the customer and disappears when unshared", async ({ page, browser }) => {
  test.skip(!process.env.E2E_BLOB_READ_WRITE_TOKEN, "Set E2E_BLOB_READ_WRITE_TOKEN to run photo tests");

  await signInOwner(page);
  await page.goto(`/admin/jobs/${jobId}`);
  await page.getByLabel("Add photo").setInputFiles(path.join(__dirname, "fixtures", "window.jpg"));
  const share = page.getByRole("switch", { name: "Share with customer" });
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

test("a lost job locks the customer out", async ({ browser }) => {
  const page = await customerPage(browser);
  await sql()`update leads set status = 'lost' where id = ${jobId}`;
  await page.reload();
  await expect(page).toHaveURL(/\/project\/sign-in$/);
});

import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run follow-up tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-followup-owner@example.com";
const STAMP = Date.now();

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

async function lead(name: string): Promise<string> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550180', 'e2e-followup@example.com', 'Henderson', 'phone', 'new') returning id`;
  return row.id as string;
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from leads where name like 'E2E FollowUp %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("a no-answer call sets tomorrow's call-back", async ({ page }) => {
  const id = await lead(`E2E FollowUp Call ${STAMP}`);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);
  await page.getByRole("button", { name: "Tomorrow 10 AM" }).click();
  await page.getByLabel("Reason").fill("checking with husband");
  await page.getByRole("button", { name: "No answer" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));
  await page.getByLabel("More actions").click();
  await expect(page.getByText(/Next call-back: .* 10:00 AM · checking with husband/)).toBeVisible();
  const [row] = await sql()`select follow_up_note from leads where id = ${id}`;
  expect(row.follow_up_note).toBe("checking with husband");
});

test("an overdue call-back shows on the board until it's done", async ({ page }) => {
  const name = `E2E FollowUp Overdue ${STAMP}`;
  const id = await lead(name);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("More actions").click();
  await page.getByRole("button", { name: "Set call-back" }).click();
  await page.getByLabel("Call-back date and time").fill("2026-01-05T09:00");
  await page.getByRole("button", { name: "Save call-back" }).click();
  await expect(page.getByText(/Next call-back: .* 9:00 AM/)).toBeVisible();

  await page.goto("/admin");
  const due = page.getByRole("region", { name: /Follow-ups due/ });
  await expect(due.getByRole("link", { name })).toBeVisible();
  await expect(due.getByRole("listitem").filter({ hasText: name })).toContainText("Overdue");

  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("More actions").click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("No call-back set")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: /Follow-ups due/ }).getByRole("link", { name })).toHaveCount(0);
});

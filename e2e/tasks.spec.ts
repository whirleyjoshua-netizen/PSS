// e2e/tasks.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run task board tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-tasks-owner@example.com";
const MATE = "e2e-tasks-mate@example.com";
const TITLE = `E2E flyers ${Date.now()}`;

async function signInAs(page: Page, email: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${email}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Yesterday in Las Vegas, as the date input wants it. */
const yesterday = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
};

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from tasks where created_by = ${OWNER}`;
  await sql()`delete from admin_login_tokens where email like 'e2e-tasks-%'`;
  await sql()`delete from admin_sessions where email like 'e2e-tasks-%'`;
});

test("create, assign, move, remind, filter and delete a task", async ({ page }) => {
  await signInAs(page, OWNER);
  await page.getByRole("link", { name: "Tasks" }).first().click();
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();

  // Create, assigned to the mate, due yesterday. No RESEND_API_KEY in e2e: the honest notice shows.
  await page.getByText("New task").click();
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Assigned to").selectOption(MATE);
  await page.getByLabel("Due date").fill(yesterday());
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("status")).toContainText("Task added. Saved, but the email to E2e Tasks Mate didn't send.");

  const card = page.getByRole("article").filter({ hasText: TITLE });
  await expect(page.getByRole("region", { name: /^To do/ }).getByRole("article").filter({ hasText: TITLE })).toBeVisible();
  await expect(card).toContainText("E2e Tasks Mate");
  await expect(card).toContainText("Overdue by 1 day");

  // Move to In progress with the status select.
  await card.getByLabel(`Status of ${TITLE}`).selectOption("doing");
  await expect(page.getByRole("region", { name: /^In progress/ }).getByRole("article").filter({ hasText: TITLE })).toBeVisible();

  // Remind now: the send fails in e2e, so the claim is given back and no "Reminded" line appears.
  await card.getByRole("button", { name: `Remind now: ${TITLE}` }).click();
  await expect(card.getByRole("alert")).toHaveText("The reminder didn't send. Try again.");
  await page.reload();
  await expect(card).not.toContainText("Reminded");

  // A reminder from a moment ago blocks another for 10 minutes.
  await sql()`update tasks set last_reminded_at = now(), last_reminded_by = ${OWNER} where title = ${TITLE}`;
  await page.reload();
  await expect(card).toContainText("Reminded");
  await card.getByRole("button", { name: `Remind now: ${TITLE}` }).click();
  await expect(card.getByRole("alert")).toContainText("Already reminded at");

  // Mine hides a task assigned to someone else; Everyone shows it again.
  await page.getByRole("link", { name: "Mine" }).click();
  await expect(page).toHaveURL(/view=mine/);
  await expect(card).toHaveCount(0);
  await page.getByRole("link", { name: "Everyone" }).click();
  await expect(card).toBeVisible();

  // Open it, delete with two taps, back on an empty board for it.
  await card.getByRole("link", { name: TITLE }).click();
  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page).toHaveURL(/\/admin\/tasks$/);
  await expect(page.getByRole("article").filter({ hasText: TITLE })).toHaveCount(0);
});

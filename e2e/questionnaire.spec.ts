import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run questionnaire tests");

const sql = () => neon(url!);
const OWNER = "e2e-questionnaire-owner@example.com";
const STAMP = Date.now();
const NAME = `E2E Questionnaire ${STAMP}`;

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from leads where name like 'E2E Questionnaire %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("a new lead answers the questionnaire and the owner sees it", async ({ page, browser }) => {
  await page.goto("/contact");
  await page.getByLabel("Name", { exact: true }).fill(NAME);
  await page.getByLabel("Phone", { exact: true }).fill("7025550188");
  await page.getByLabel("Email", { exact: true }).fill(`e2e-q-${STAMP}@example.com`);
  await page.getByLabel("Street address").fill("12 Sample St");
  await page.getByLabel("City", { exact: true }).selectOption("Henderson");
  await page.getByLabel("Approximate number of windows").selectOption("6-10");
  await page.getByRole("button", { name: /request free consultation/i }).click();
  await expect(page).toHaveURL(/\/thank-you$/);

  const card = page.getByRole("region", { name: "Help us come prepared" });
  await expect(card.getByText("You said 6-10 earlier.")).toBeVisible();
  await expect(card.getByLabel("Street address")).toHaveValue("12 Sample St");
  await card.getByLabel("How many windows?").selectOption("12");
  await card.getByLabel("Cellular shades").check();
  await card.getByLabel("Shutters").check();
  await card.getByLabel(/^Motorized/).check();
  await card.getByLabel(/^Gate or community code/).fill("#4321");
  await card.getByRole("radio", { name: /^Luxury/ }).check();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/thank-you\/all-set$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Consider it done.");

  const [lead] = await sql()`select id, status, window_count_exact, treatment_types, motorized, gate_code, finish, budget_tier
    from leads where name = ${NAME}`;
  expect(lead).toMatchObject({ status: "new", window_count_exact: 12, treatment_types: ["shutters", "cellular_shades"],
    motorized: true, gate_code: "#4321", finish: "luxury", budget_tier: "premium" });

  // Another browser has no key, so it gets the plain thank-you page.
  const stranger = await browser.newContext();
  const other = await stranger.newPage();
  await other.goto("/thank-you");
  await expect(other.getByRole("heading", { level: 1 })).toContainText(/thank you/i);
  await expect(other.getByRole("region", { name: "Help us come prepared" })).toHaveCount(0);
  await stranger.close();

  await signIn(page);
  await page.goto(`/admin/jobs/${lead.id}`);
  const project = page.getByRole("region", { name: "Project details" });
  await expect(project.locator("dt", { hasText: /^Exact windows$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("12");
  for (const text of ["Shutters", "Cellular shades", "#4321", "Luxury → Premium"]) await expect(project).toContainText(text);
  await expect(page.getByText("Customer added details: 12 windows · Shutters, Cellular shades · Motorized · Luxury")).toBeVisible();
});

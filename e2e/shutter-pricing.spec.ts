import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const EMAIL = "e2e-shutters@example.com";
/** Set SHOT_DIR to save screenshots of both screens for review. */
const shot = async (page: Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: true });
};

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${EMAIL}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

// Rates are global: every run starts and ends with none. Made-up numbers only (public repo).
async function reset() {
  await sql()`delete from shutter_lines`;
  await sql()`delete from shutter_options`;
  await sql()`delete from shutter_freight`;
  await sql()`update shutter_settings set markup_hundredths = null, install_cents_per_sqft = null`;
  await sql()`delete from install_rates where treatment = 'shutters'`;
}

test.beforeAll(async () => { if (url) await reset(); });
test.afterAll(async () => {
  if (url) {
    await reset();
    await sql()`delete from admin_login_tokens where email = ${EMAIL}`;
    await sql()`delete from admin_sessions where email = ${EMAIL}`;
  }
});

test("rates entered on the Rates screen price a window on the quote screen", async ({ page }) => {
  // Settings' shutter rate prices install-only jobs; the guide must ignore it and use its own.
  await sql()`insert into install_rates (treatment, basis, rate_cents) values ('shutters', 'sq_ft', 930)`;
  await signIn(page);

  await page.goto("/admin/resources");
  await page.getByRole("link", { name: "Shutter pricing" }).click();
  await expect(page.getByText("No shutter rates yet")).toBeVisible();
  await page.getByRole("link", { name: "Rates", exact: true }).click();

  const norman = page.getByRole("region", { name: "Norman" });
  await norman.getByRole("button", { name: "Add a Norman line" }).click();
  await norman.getByLabel("Line", { exact: true }).fill("Alpha");
  await norman.getByLabel("$ / sq ft").fill("10");
  await norman.getByLabel("Minimum sq ft", { exact: true }).fill("8");
  await norman.getByText("Paste a list of Norman add-ons").click();
  await norman.getByRole("textbox", { name: /One per line/ }).fill("Premium color | % | 10\nAngle top | window | 200\nCustom color | order | 200");
  await norman.getByRole("button", { name: "Add these rows" }).click();
  await norman.getByLabel("First shutter ($)", { exact: true }).fill("75");
  await norman.getByLabel("Each additional ($)", { exact: true }).fill("25");
  await page.getByLabel("Markup (× cost)").fill("2");
  await page.getByLabel("Installation ($ per sq ft)").fill("6");
  await shot(page, "rates-desktop");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.reload();
  await expect(page.getByLabel("Markup (× cost)")).toHaveValue("2");
  await expect(norman.getByRole("textbox", { name: "Add-on" }).nth(1)).toHaveValue("Angle top");

  await page.getByRole("link", { name: "Shutter pricing" }).click();
  const w1 = page.getByRole("listitem", { name: "Window 1" });
  await w1.getByLabel("Room").fill("Kitchen");
  await w1.getByLabel("Width (in)").fill("36");
  await w1.getByLabel("Height (in)").fill("60");
  // 15 sq ft × $10 = $150, freight $75, install 15 × $6 = $90: (150 + 75) × 2 + 90 = $540
  await expect(w1).toContainText("15 sq ft · Cost $150 · Install $90 · Price $540");
  await w1.getByText("Add-ons").click();
  await w1.getByLabel("Angle top").check();
  await expect(w1).toContainText("Price $940");
  await page.getByRole("button", { name: "Add a window" }).click();
  const w2 = page.getByRole("listitem", { name: "Window 2" });
  await w2.getByLabel("Room").fill("Bath");
  await w2.getByLabel("Width (in)").fill("23 1/2");
  await w2.getByLabel("Height (in)").fill("24");
  await expect(w2).toContainText("billed as 8");
  await expect(page.getByRole("region", { name: "Totals" })).toContainText("Client price");
  await shot(page, "quote-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "quote-phone");
});

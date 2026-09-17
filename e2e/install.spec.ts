import { test, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin tests");

test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const EMAIL = "e2e-install@example.com";

async function signIn(page: import("@playwright/test").Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash}, ${EMAIL}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

/** The job's saved price snapshots, newest first. */
const savedPrices = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Saved prices" });

/** Rates are global, so every run starts and ends with none configured. */
async function resetRates() {
  await sql()`delete from install_rates`;
  await sql()`update install_settings set minimum_cents = 0, hard_surface_cents = 0,
    high_ladder_cents = 0, motorized_cents = 0, measure_cents = 0, updated_by = null, updated_at = now()`;
}

test.beforeAll(async () => {
  if (url) await resetRates();
});

test.afterAll(async () => {
  if (url) {
    // install_quotes and their lines cascade from the lead.
    await sql()`delete from leads where name like 'E2E Install %'`;
    await sql()`delete from admin_login_tokens where email = ${EMAIL}`;
    await sql()`delete from admin_sessions where email = ${EMAIL}`;
    await resetRates();
  }
});

test("rates set in Settings price a job, and the snapshot survives a rate change", async ({ page }) => {
  const name = `E2E Install ${Date.now()}`;
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550401', ${EMAIL}, 'Henderson', 'phone', 'quoted')
    returning id`;
  await signIn(page);

  await page.goto("/admin/settings");
  await page.getByLabel("Roller shades priced by").selectOption("window");
  await page.getByLabel("Roller shades rate").fill("25");
  await page.getByLabel("Minimum job cost").fill("150");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.goto(`/admin/jobs/${row.id}?tab=install`);
  await page.getByRole("button", { name: /add line/i }).click();
  await page.getByLabel("Treatment").selectOption("roller_shades");
  await page.getByLabel("Windows").fill("4");
  await expect(page.getByTestId("install-total")).toHaveText("$150");
  await expect(page.getByText(/minimum job cost applied/i)).toBeVisible();

  await page.getByLabel("Windows").fill("10");
  await expect(page.getByTestId("install-total")).toHaveText("$250");
  await page.getByRole("button", { name: /save as estimate/i }).click();
  await expect(savedPrices(page).getByRole("listitem").first()).toContainText("$250");

  // Raising the rate must not rewrite what was already quoted.
  await page.goto("/admin/settings");
  await page.getByLabel("Roller shades rate").fill("40");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto(`/admin/jobs/${row.id}?tab=install`);

  // Prove the new rate took effect before trusting that the old snapshot ignored it.
  await page.getByRole("button", { name: /add line/i }).click();
  await page.getByLabel("Treatment").selectOption("roller_shades");
  await page.getByLabel("Windows").fill("10");
  await expect(page.getByTestId("install-total")).toHaveText("$400");
  await expect(savedPrices(page).getByRole("listitem").first()).toContainText("$250");

  await page.getByRole("button", { name: /save as final/i }).click();
  const items = savedPrices(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Final");
  await expect(items.nth(0)).toContainText("$400");
  await expect(items.nth(1)).toContainText("Estimate");
  await expect(items.nth(1)).toContainText("$250");
});

test("a charged measuring fee goes on top of the minimum, is saved as shown, and survives a fee change", async ({ page }) => {
  const name = `E2E Install Measure ${Date.now()}`;
  const [job] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550402', ${EMAIL}, 'Henderson', 'phone', 'quoted')
    returning id`;
  await signIn(page);

  await page.goto("/admin/settings");
  await page.getByLabel("Roller shades priced by").selectOption("window");
  await page.getByLabel("Roller shades rate").fill("25");
  await page.getByLabel("Minimum job cost").fill("150");
  await page.getByLabel("Measurement fee").fill("75");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.goto(`/admin/jobs/${job.id}?tab=install`);
  const charge = page.getByRole("checkbox", { name: "Charge for measuring" });
  await expect(charge).not.toBeChecked();
  await page.getByRole("button", { name: /add line/i }).click();
  await page.getByLabel("Treatment").selectOption("roller_shades");
  await page.getByLabel("Windows").fill("2");
  await expect(page.getByTestId("install-total")).toHaveText("$150");

  // $50 of work rises to the $150 minimum; the $75 measure goes on top of it.
  await charge.check();
  await expect(page.getByTestId("install-measure")).toHaveText("$75");
  await expect(page.getByTestId("install-total")).toHaveText("$225");
  await page.getByRole("button", { name: /save as estimate/i }).click();

  const saved = savedPrices(page).getByRole("listitem").first();
  await expect(saved).toContainText("$225");
  await expect(saved).toContainText("Includes $75 measurement");
  await expect(saved).toContainText("Minimum applied (lines came to $50)");
  const [stored] = await sql()`select subtotal_cents, measure_cents, total_cents
    from install_quotes where lead_id = ${job.id}`;
  expect(stored).toEqual({ subtotal_cents: 5000, measure_cents: 7500, total_cents: 22_500 });

  // Raising the fee must not rewrite the saved price — and must reach new work.
  await page.goto("/admin/settings");
  await page.getByLabel("Measurement fee").fill("90");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto(`/admin/jobs/${job.id}?tab=install`);
  await page.getByRole("checkbox", { name: "Charge for measuring" }).check();
  await expect(page.getByTestId("install-total")).toHaveText("$90");
  await expect(savedPrices(page).getByRole("listitem").first()).toContainText("$225");

  // A measuring-only visit: no lines, just the fee.
  await page.getByRole("button", { name: /save as final/i }).click();
  const items = savedPrices(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Final");
  await expect(items.nth(0)).toContainText("$90");
  await expect(items.nth(0)).toContainText("Includes $90 measurement");
  await expect(items.nth(0)).not.toContainText(/minimum applied/i);
  await expect(items.nth(1)).toContainText("$225");
});

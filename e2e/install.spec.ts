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
    high_ladder_cents = 0, motorized_cents = 0, updated_by = null, updated_at = now()`;
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
  await expect(savedPrices(page).getByRole("listitem").first()).toContainText("$250");
});

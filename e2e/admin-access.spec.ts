import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin access tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-access-owner@example.com";
const GUEST = `e2e-access-guest-${Date.now()}@example.com`;

async function signInAs(page: Page, email: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${email}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from admin_access where email like 'e2e-access-%'`;
  await sql()`delete from admin_login_tokens where email like 'e2e-access-%'`;
  await sql()`delete from admin_sessions where email like 'e2e-access-%'`;
});

test("give access, they sign in, remove them, they are out", async ({ browser }) => {
  const ownerPage = await (await browser.newContext()).newPage();
  await signInAs(ownerPage, OWNER);
  await expect(ownerPage.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();

  await ownerPage.goto("/admin/settings");
  const access = ownerPage.getByRole("region", { name: "Admin access" });
  await expect(access.getByText(OWNER).locator("xpath=ancestor::li")).toContainText("Owner");
  await access.getByLabel("Email").fill(GUEST.toUpperCase());
  await access.getByRole("button", { name: "Give access" }).click();
  // No RESEND_API_KEY in e2e, so the honest fallback message shows.
  await expect(access.getByRole("status")).toContainText(`Access given to ${GUEST}`);
  await expect(access.getByRole("button", { name: `Remove ${GUEST}` })).toBeVisible();

  const guestPage = await (await browser.newContext()).newPage();
  await signInAs(guestPage, GUEST);
  await expect(guestPage.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();

  await access.getByRole("button", { name: `Remove ${GUEST}` }).click();
  await expect(access.getByRole("listitem").filter({ hasText: GUEST })).toHaveCount(0);
  // Removing one person leaves the owner in place, and the "Access given to" line goes with them.
  await expect(access.getByRole("listitem").filter({ hasText: OWNER })).toContainText("Owner");
  await expect(access.getByText(/Access given to/)).toHaveCount(0);

  await guestPage.goto("/admin/settings");
  await expect(guestPage).toHaveURL(/\/admin\/sign-in/);
});

test("an unknown address cannot sign in", async ({ page }) => {
  await signInAs(page, "e2e-access-stranger@example.com");
  await expect(page).not.toHaveURL(/\/admin$/);
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/sign-in/);
});

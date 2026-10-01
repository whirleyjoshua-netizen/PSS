import { test, expect } from "@playwright/test";

/**
 * The API is stubbed here on purpose. These tests verify the browser-side
 * journey — validation, submission, confirmation, and failure recovery.
 * That the route actually writes to Neon and sends through Resend is proven
 * separately against real credentials; mocks cannot prove it.
 */

test("a visitor can request a consultation from the homepage hero", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;

  await page.route("**/api/consultation", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { ok: true } });
  });

  await page.goto("/");
  await page.getByLabel("Name", { exact: true }).fill("Dana Reyes");
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0134");
  await page.getByLabel("Email", { exact: true }).fill("dana@example.com");
  await page.getByRole("button", { name: /invite us over/i }).click();

  await expect(page).toHaveURL(/\/thank-you$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/thank you/i);
  expect(submitted).toMatchObject({
    name: "Dana Reyes",
    phone: "7025550134",
    email: "dana@example.com",
    source: "hero",
  });
});

test("the full contact form submits with treatments and city", async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;

  await page.route("**/api/consultation", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { ok: true } });
  });

  await page.goto("/contact");
  await page.getByLabel("Name", { exact: true }).fill("Dana Reyes");
  await page.getByLabel("Phone", { exact: true }).fill("7025550134");
  await page.getByLabel("Email", { exact: true }).fill("dana@example.com");
  await page.getByLabel("City", { exact: true }).selectOption("Henderson");
  await page.getByRole("checkbox", { name: "Shades" }).check();
  await page
    .getByLabel(/anything else/i)
    .fill("West-facing living room, brutal afternoon sun.");
  await page.getByRole("button", { name: /invite us over/i }).click();

  await expect(page).toHaveURL(/\/thank-you$/);
  expect(submitted).toMatchObject({
    city: "Henderson",
    source: "contact",
    treatments: ["Shades"],
  });
});

test("a bad phone number is caught before any network request", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/consultation", async (route) => {
    calls += 1;
    await route.fulfill({ status: 201, json: { ok: true } });
  });

  await page.goto("/");
  await page.getByLabel("Name", { exact: true }).fill("Dana Reyes");
  await page.getByLabel("Phone", { exact: true }).fill("555");
  await page.getByLabel("Email", { exact: true }).fill("dana@example.com");
  await page.getByRole("button", { name: /invite us over/i }).click();

  // Scope to the form: Next injects its own role="alert" route announcer.
  await expect(page.locator("form").getByRole("alert")).toContainText(/10-digit/i);
  expect(calls).toBe(0);
});

test("a server failure offers the phone number as a fallback", async ({ page }) => {
  await page.route("**/api/consultation", (route) =>
    route.fulfill({
      status: 502,
      json: { ok: false, error: "We could not submit your request. Please call us." },
    }),
  );

  await page.goto("/");
  await page.getByLabel("Name", { exact: true }).fill("Dana Reyes");
  await page.getByLabel("Phone", { exact: true }).fill("7025550134");
  await page.getByLabel("Email", { exact: true }).fill("dana@example.com");
  await page.getByRole("button", { name: /invite us over/i }).click();

  const alert = page.locator("form").getByRole("alert");
  await expect(alert).toContainText(/call/i);
  await expect(alert.locator('a[href^="tel:"]')).toBeVisible();
});

test("the hero form is fully operable by keyboard", async ({ page }) => {
  await page.route("**/api/consultation", (route) =>
    route.fulfill({ status: 201, json: { ok: true } }),
  );

  await page.goto("/");
  await page.getByLabel("Name", { exact: true }).focus();
  await page.keyboard.type("Dana Reyes");
  await page.keyboard.press("Tab");
  await page.keyboard.type("7025550134");
  await page.keyboard.press("Tab");
  await page.keyboard.type("dana@example.com");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/thank-you$/);
});

test("the honeypot is present but invisible to a sighted user", async ({ page }) => {
  await page.goto("/");
  const honeypot = page.locator('input[name="company"]').first();

  await expect(honeypot).toBeAttached();
  await expect(honeypot).not.toBeInViewport();
});

test("a visitor can book from the booking block on a product page", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/consultation", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/motorization");
  const block = page.locator("section#book");
  await block.getByLabel("Name", { exact: true }).fill("Dana Reyes");
  await block.getByLabel("Phone", { exact: true }).fill("7025550134");
  await block.getByLabel("Email", { exact: true }).fill("dana@example.com");
  await block.getByRole("button", { name: /invite us over/i }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/thank you/i);
  expect(posted).toMatchObject({ source: "booking" });
});

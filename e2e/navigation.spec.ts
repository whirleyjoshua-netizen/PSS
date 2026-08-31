import { test, expect } from "@playwright/test";

const ROUTES = [
  "/",
  "/blinds",
  "/shades",
  "/shutters",
  "/outdoor",
  "/motorization",
  "/shades/solar-shades",
  "/shutters/plantation-shutters",
  "/outdoor/solar-screens",
  "/blinds/wood-blinds",
  "/service-area/las-vegas",
  "/service-area/henderson",
  "/service-area/summerlin",
  "/service-area/north-las-vegas",
  "/gallery",
  "/about",
  "/contact",
  "/privacy",
  "/accessibility",
];

for (const route of ROUTES) {
  test(`${route} renders cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto(route);

    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("an unknown product slug is a real 404", async ({ page }) => {
  const response = await page.goto("/shades/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("an unknown category is a real 404", async ({ page }) => {
  const response = await page.goto("/drapery");
  expect(response?.status()).toBe(404);
});

test("every page carries a unique title and a meta description", async ({ page }) => {
  const seen = new Set<string>();

  for (const route of ["/", "/shades", "/shades/solar-shades", "/service-area/henderson"]) {
    await page.goto(route);
    const title = await page.title();
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");

    expect(title.length).toBeGreaterThan(10);
    expect(description?.length).toBeGreaterThan(50);
    expect(seen.has(title)).toBe(false);
    seen.add(title);
  }
});

test("the sitemap lists the product pages", async ({ request }) => {
  const response = await request.get("/sitemap.xml");

  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/shades/solar-shades");
  expect(body).toContain("/service-area/north-las-vegas");
});

test("robots.txt points at the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("sitemap.xml");
});

test("the site publishes LocalBusiness structured data", async ({ page }) => {
  await page.goto("/");
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const parsed = blocks.map((block) => JSON.parse(block));

  expect(parsed.some((schema) => schema["@type"] === "HomeAndConstructionBusiness")).toBe(true);
});

test("a product page publishes Product and BreadcrumbList data", async ({ page }) => {
  await page.goto("/shades/solar-shades");
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = blocks.map((block) => JSON.parse(block)["@type"]);

  expect(types).toContain("Product");
  expect(types).toContain("BreadcrumbList");
});

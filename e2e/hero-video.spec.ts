import { test, expect } from "@playwright/test";

test("the Motorization hero video plays silently on its own", async ({ page }) => {
  await page.goto("/motorization");
  const video = page.locator("section#book video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.5);
  expect(await video.evaluate((v: HTMLVideoElement) => ({ paused: v.paused, muted: v.muted, loop: v.loop }))).toEqual({
    paused: false,
    muted: true,
    loop: true,
  });
});

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the Motorization hero shows the still photo and no video", async ({ page }) => {
    await page.goto("/motorization");
    await expect(page.locator("section#book video")).toBeHidden();
    await expect(page.locator("section#book img")).toBeVisible();
  });
});

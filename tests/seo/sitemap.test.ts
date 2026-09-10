import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { business } from "@/content/business";

describe("sitemap", () => {
  it("lists every public route exactly once", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    // 1 home + 5 hubs + 16 products + 4 cities
    // + gallery, about, contact, privacy, accessibility
    expect(urls).toHaveLength(31);
    expect(new Set(urls).size).toBe(31);
  });

  it("uses absolute URLs on the production domain", async () => {
    for (const entry of await sitemap()) {
      expect(entry.url.startsWith(business.domain)).toBe(true);
    }
  });

  it("ranks the homepage above deeper pages", async () => {
    const entries = await sitemap();
    const home = entries.find((entry) => entry.url === business.domain);
    const product = entries.find((entry) => entry.url.includes("/shades/solar-shades"));

    expect(home?.priority).toBeGreaterThan(product?.priority ?? 1);
  });

  it("excludes the API route and other non-pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/api/"))).toBe(false);
  });

  it("leaves out the post-submission thank-you page", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/thank-you"))).toBe(false);
  });
});

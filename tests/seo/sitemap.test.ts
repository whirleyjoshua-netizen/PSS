import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { business } from "@/content/business";

describe("sitemap", () => {
  it("lists every public route exactly once", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    // 1 home + 5 hubs + 12 products + 4 cities
    // + gallery, reviews, about, contact, privacy, accessibility
    // + the guides index and 2 guides
    expect(urls).toHaveLength(31);
    expect(new Set(urls).size).toBe(31);
  });

  it("lists the guides index and every guide, dated by the guide", async () => {
    const { guides } = await import("@/content/guides");
    const entries = await sitemap();
    expect(entries.some((e) => e.url === `${business.domain}/guides`)).toBe(true);
    for (const guide of guides) {
      const entry = entries.find((e) => e.url === `${business.domain}/guides/${guide.slug}`);
      expect(entry, guide.slug).toBeDefined();
      expect(entry!.lastModified).toEqual(new Date(guide.updated));
    }
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

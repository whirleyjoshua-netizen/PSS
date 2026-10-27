import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { business } from "@/content/business";

describe("sitemap", () => {
  it("lists every public route exactly once", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    // 1 home + 5 hubs + 12 products + 4 cities
    // + gallery, reviews, about, contact, privacy, accessibility, faq
    // + 2 guides (the guides index now redirects to /faq#care) + 3 buying guides (/learn, 2026-10-22)
    expect(urls).toHaveLength(37);
    expect(new Set(urls).size).toBe(37);
  });

  it("lists the FAQ undated (its answers come from other files, so no one date is true), and not the retired guides index", async () => {
    const entries = await sitemap();
    const faq = entries.find((e) => e.url === `${business.domain}/faq`);
    expect(faq?.priority).toBe(0.8);
    expect(faq?.lastModified).toBeUndefined();
    expect(entries.some((e) => e.url === `${business.domain}/guides`)).toBe(false);
  });

  it("claims a last-modified date only where the content model records one", async () => {
    const { guides } = await import("@/content/guides");
    const { articles } = await import("@/content/articles");
    const dated = new Set([
      ...guides.map((g) => `${business.domain}/guides/${g.slug}`),
      ...articles.map((a) => `${business.domain}/learn/${a.slug}`),
    ]);
    for (const entry of await sitemap()) {
      if (dated.has(entry.url)) expect(entry.lastModified, entry.url).toBeInstanceOf(Date);
      else expect(entry.lastModified, entry.url).toBeUndefined();
    }
  });

  it("lists every guide, dated by the guide", async () => {
    const { guides } = await import("@/content/guides");
    const entries = await sitemap();
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

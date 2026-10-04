import { describe, it, expect } from "vitest";
import { DIAGRAM_IDS, guides, guideBySlug, updatedLabel } from "@/content/guides";
import { CATEGORY_SLUGS } from "@/content/products";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("guides content", () => {
  it("ships the two first-release guides", () => {
    expect(guides.map((g) => g.slug)).toEqual([
      "cordless-cellular-shade-wont-stay-up",
      "replace-a-broken-blind-slat",
    ]);
  });

  it("has unique slugs that never collide with a category or the index", () => {
    const slugs = guides.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(CATEGORY_SLUGS as readonly string[]).not.toContain(slug);
      expect(slug).not.toBe("guides");
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(CATEGORY_SLUGS as readonly string[]).not.toContain("guides");
  });

  it.each(guides.map((g) => [g.slug, g] as const))("%s is complete", (_slug, guide) => {
    expect(CATEGORY_SLUGS).toContain(guide.category);
    expect(guide.steps.length).toBeGreaterThanOrEqual(3);
    expect(guide.steps.length).toBeLessThanOrEqual(8);
    expect(guide.faq.length).toBeGreaterThanOrEqual(2);
    expect(guide.faq.length).toBeLessThanOrEqual(5);
    expect(guide.published).toMatch(ISO);
    expect(guide.updated).toMatch(ISO);
    expect(guide.updated >= guide.published).toBe(true);
    expect(guide.minutes).toBeGreaterThan(0);
    for (const text of [guide.title, guide.crumb, guide.quickAnswer, guide.why, guide.tools, guide.seo.title, guide.seo.description, guide.cta.eyebrow, guide.cta.headline, guide.cta.body]) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
    for (const step of guide.steps) {
      expect(DIAGRAM_IDS).toContain(step.diagram);
      expect(step.title.trim()).not.toBe("");
      expect(step.body.trim()).not.toBe("");
    }
  });

  it("links related guides that exist and are not itself", () => {
    for (const guide of guides) {
      for (const slug of guide.related) {
        expect(slug).not.toBe(guide.slug);
        expect(guideBySlug(slug), `${guide.slug} → ${slug}`).toBeDefined();
      }
    }
  });

  it("finds a guide by slug and nothing for an unknown slug", () => {
    expect(guideBySlug("replace-a-broken-blind-slat")?.category).toBe("blinds");
    expect(guideBySlug("nope")).toBeUndefined();
  });

  it("labels the updated date as month and year, independent of time zone", () => {
    expect(updatedLabel({ ...guides[0], updated: "2026-10-01" })).toBe("Oct 2026");
    expect(updatedLabel({ ...guides[0], updated: "2027-01-31" })).toBe("Jan 2027");
  });
});

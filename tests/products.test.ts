import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { categories, products } from "@/content/products";
import {
  getCategory,
  getProduct,
  getProductsIn,
  allProductPaths,
} from "@/lib/content/products";

describe("product taxonomy", () => {
  it("has the five launch categories in nav order", () => {
    expect(categories.map((c) => c.slug)).toEqual([
      "blinds",
      "shades",
      "shutters",
      "outdoor",
      "motorization",
    ]);
  });

  it("excludes drapery from launch", () => {
    // The CategorySlug union makes a drapery product a compile error, so the
    // only runtime check worth keeping is the lookup by arbitrary string.
    expect(getCategory("drapery")).toBeUndefined();
  });

  it("has fourteen child products", () => {
    expect(products).toHaveLength(14);
  });

  it("no longer carries aluminum or mini blinds", () => {
    const slugs = products.map((product) => product.slug);
    expect(slugs).not.toContain("aluminum-blinds");
    expect(slugs).not.toContain("mini-blinds");
  });

  it("gives motorization no children", () => {
    expect(getProductsIn("motorization")).toEqual([]);
  });

  it("uses globally unique product slugs", () => {
    const slugs = products.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("assigns every product to a real category", () => {
    const known = new Set(categories.map((c) => c.slug));
    for (const product of products) {
      expect(known.has(product.category)).toBe(true);
    }
  });

  it("gives every product SEO copy that fits and names the market", () => {
    for (const product of products) {
      expect(product.seo.title.length).toBeGreaterThan(10);
      expect(product.seo.title.length).toBeLessThanOrEqual(60);
      expect(product.seo.description.length).toBeLessThanOrEqual(160);
      expect(product.seo.description).toMatch(/Las Vegas/);
    }
  });

  it("gives every category SEO copy that fits and names the market", () => {
    for (const category of categories) {
      expect(category.seo.title.length).toBeLessThanOrEqual(60);
      expect(category.seo.description.length).toBeLessThanOrEqual(160);
      expect(category.seo.description).toMatch(/Las Vegas/);
    }
  });

  it("gives every product real body copy, not a stub", () => {
    for (const product of products) {
      expect(product.body.length).toBeGreaterThanOrEqual(2);
      expect(product.body.join(" ").length).toBeGreaterThan(300);
      expect(product.features.length).toBeGreaterThanOrEqual(3);
      expect(product.bestFor.length).toBeGreaterThan(10);
    }
  });

  it("writes distinct copy per product rather than reusing boilerplate", () => {
    const bodies = products.map((p) => p.body.join(" "));
    expect(new Set(bodies).size).toBe(products.length);
  });

  it("resolves a known product and rejects an unknown one", () => {
    expect(getProduct("shades", "solar-shades")?.name).toBe("Solar Shades");
    expect(getProduct("shades", "nope")).toBeUndefined();
    expect(getProduct("blinds", "solar-shades")).toBeUndefined();
  });

  it("produces one static path per child product", () => {
    expect(allProductPaths()).toHaveLength(14);
    expect(allProductPaths()).toContainEqual({
      category: "shades",
      product: "solar-shades",
    });
  });
});

describe("redesign wording (spec 2026-10-01 §5)", () => {
  const WORDING: Record<string, { highlights: [string, string][]; eyebrow: string; heading: string; caption: [string, string] }> = {
    blinds: {
      highlights: [["Glare control", "sun"], ["Privacy", "eye"], ["Wipe clean", "droplet"], ["Wide glass", "window"]],
      eyebrow: "Keep the light, lose the glare",
      heading: "Control Without Closing the Room Off",
      caption: ["Made for hard-working rooms", "Kitchens, baths and home offices."],
    },
    shades: {
      highlights: [["Light control", "sun"], ["Privacy", "eye"], ["Energy savings", "leaf"], ["Desert-ready fabrics", "home"]],
      eyebrow: "More than a window covering",
      heading: "A Single Panel That Changes the Room",
      caption: ["Chosen for this valley", "The right fabric for every exposure."],
    },
    shutters: {
      highlights: [["Built to fit", "ruler"], ["Sun-proof", "sun"], ["No cords", "shield"], ["Adds value", "home"]],
      eyebrow: "Part of the house",
      heading: "The Treatment That Reads as Architecture",
      caption: ["Fitted to the opening", "Framed, finished and built to last."],
    },
    outdoor: {
      highlights: [["Heat blocking", "thermometer"], ["Patio comfort", "sofa"], ["Energy savings", "leaf"], ["UV protection", "shield"]],
      eyebrow: "Shade before the glass",
      heading: "The Patio You Actually Use",
      caption: ["Measured properly", "A covered patio, 15–20° cooler."],
    },
    motorization: {
      highlights: [["App & remote", "phone"], ["Schedules", "clock"], ["No wiring", "battery"], ["High windows", "arrow-up"]],
      eyebrow: "No electrician required",
      heading: "Shades That Beat the Sun to the Window",
      caption: ["On schedule", "Closes itself every summer afternoon."],
    },
  };

  it.each(categories.map((c) => [c.slug, c] as const))("%s carries the approved highlights and story wording", (slug, category) => {
    const want = WORDING[slug];
    expect(category.highlights.map((h) => [h.label, h.icon])).toEqual(want.highlights);
    expect(category.story).toEqual({ eyebrow: want.eyebrow, heading: want.heading, caption: { eyebrow: want.caption[0], line: want.caption[1] } });
  });
});

describe("story photos (spec §6)", () => {
  const WITH_STORY = ["roller-shades", "solar-shades", "cellular-shades", "plantation-shutters", "composite-shutters", "wood-shutters"];

  it("are set on exactly the products we have a second photo of", () => {
    expect(products.filter((p) => p.storyPhoto).map((p) => p.slug).sort()).toEqual([...WITH_STORY].sort());
  });

  it.each(WITH_STORY)("%s: the story photo differs from its own photo, exists, and has alt text", (slug) => {
    const product = products.find((p) => p.slug === slug)!;
    expect(product.storyPhoto!.src).not.toBe(product.image?.src);
    expect(product.storyPhoto!.alt.trim().length).toBeGreaterThan(20);
    expect(existsSync(path.join(process.cwd(), "public", product.storyPhoto!.src))).toBe(true);
  });
});

describe("the owners' photos of 2026-10-01", () => {
  const PLACED: [string, string, string | undefined][] = [
    ["roller-shades", "/gallery/roller-shades-dining-room.webp", "/gallery/roller-shades-transom-closeup.webp"],
    ["solar-shades", "/gallery/solar-shades-balcony-view.webp", "/gallery/solar-shades-long-window.webp"],
    ["roman-shades", "/gallery/roman-shades-primary-bath.webp", undefined],
    // Owner: the three shutter types look the same, so shutter photos are shared among them.
    ["plantation-shutters", "/gallery/plantation-shutters-dining-room.webp", "/gallery/plantation-shutters-bedroom.webp"],
    ["composite-shutters", "/gallery/plantation-shutters-french-doors.webp", "/gallery/plantation-shutters-bedroom.webp"],
    ["wood-shutters", "/gallery/plantation-shutters-bath.webp", "/gallery/plantation-shutters-kitchen-sink.webp"],
  ];

  it("Shutters leads with the primary-bath photo", () => {
    expect(categories.find((c) => c.slug === "shutters")?.bookingPhoto?.src).toBe("/gallery/plantation-shutters-primary-bath-pendant.webp");
  });

  it.each(PLACED)("%s shows its own photos", (slug, image, story) => {
    const product = products.find((p) => p.slug === slug)!;
    expect(product.image?.src).toBe(image);
    expect(product.storyPhoto?.src).toBe(story);
    expect(existsSync(path.join(process.cwd(), "public", image))).toBe(true);
    expect(product.image!.alt.trim().length).toBeGreaterThan(20);
  });
});

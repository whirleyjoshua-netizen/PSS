import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  localBusinessSchema,
  serviceSchema,
  BUSINESS_ID,
  breadcrumbSchema,
  articleSchema,
} from "@/lib/seo/schema";
import { products } from "@/content/products";
import { business } from "@/content/business";
import { guides } from "@/content/guides";

describe("structured data", () => {
  it("describes the business with its service area", () => {
    const schema = localBusinessSchema();

    expect(schema["@type"]).toBe("HomeAndConstructionBusiness");
    expect(schema.name).toBe("Premier Shade Solutions");
    expect(schema.areaServed).toHaveLength(4);
    expect(schema.url).toBe(business.domain);
  });

  it("publishes the city but never a street while the street is a placeholder", () => {
    // A wrong street address in LocalBusiness schema is worse than none —
    // it can attach the business to a location it has never operated from.
    expect(business.address.isPlaceholder).toBe(true);
    expect(localBusinessSchema().address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Las Vegas",
      addressRegion: "NV",
      addressCountry: "US",
    });
  });

  it("gives the business a stable @id, a logo and an image that exist", () => {
    const schema = localBusinessSchema();
    expect(schema["@id"]).toBe("https://premiershadesolutions.com/#business");
    for (const url of [schema.logo, schema.image]) {
      expect(url.startsWith(business.domain)).toBe(true);
      expect(existsSync(path.join(process.cwd(), "public", url.slice(business.domain.length)))).toBe(true);
    }
  });

  it("claims no opening hours and no ratings or reviews", () => {
    // Hours are by appointment; our reviews pre-date the business (content/reviews.ts).
    expect(JSON.stringify(localBusinessSchema())).not.toMatch(/openingHours|AggregateRating|"Review"|reviewRating/);
  });

  it.each(products.map((p) => [p.slug, p] as const))("describes %s as a Service the business provides", (_slug, product) => {
    const schema = serviceSchema(product);

    expect(schema["@type"]).toBe("Service");
    expect(schema.name).toBe(product.name);
    expect(schema.serviceType).toBe(product.name);
    expect(schema.description).toBe(product.seo.description);
    expect(schema.provider).toEqual({ "@id": BUSINESS_ID });
    expect(schema.areaServed.map((a) => a.name)).toEqual(business.serviceArea.map((c) => `${c}, NV`));
    expect(schema.url).toBe(`${business.domain}/${product.category}/${product.slug}`);
    expect(JSON.stringify(schema)).not.toMatch(/"Product"|offers|review/i);
  });

  it("builds an ordered breadcrumb trail with absolute urls", () => {
    const schema = breadcrumbSchema([
      { name: "Shades", url: "/shades" },
      { name: "Solar Shades", url: "/shades/solar-shades" },
    ]);

    // Home is prepended so the schema mirrors the breadcrumb the visitor sees.
    expect(schema.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(schema.itemListElement[0].name).toBe("Home");
    expect(schema.itemListElement[2].item).toBe(
      `${business.domain}/shades/solar-shades`,
    );
  });
});

describe("articleSchema", () => {
  it("describes a guide as an Article by the business, dated by the guide", () => {
    const guide = guides[0];
    const schema = articleSchema(guide);
    expect(schema["@type"]).toBe("Article");
    expect(schema.headline).toBe(guide.title);
    expect(schema.url).toBe(`${business.domain}/guides/${guide.slug}`);
    expect(schema.datePublished).toBe(guide.published);
    expect(schema.dateModified).toBe(guide.updated);
    expect(schema.author).toEqual({ "@type": "Organization", name: business.name, url: business.domain });
    expect(JSON.stringify(schema)).not.toMatch(/HowTo|FAQPage/);
  });
});

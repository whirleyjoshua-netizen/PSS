import { describe, it, expect } from "vitest";
import {
  localBusinessSchema,
  productSchema,
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

  it("omits the postal address while it is a placeholder", () => {
    // A wrong address in LocalBusiness schema is worse than no address —
    // it can attach the business to a location it has never operated from.
    expect(business.address.isPlaceholder).toBe(true);
    expect(localBusinessSchema().address).toBeUndefined();
  });

  it("describes a product", () => {
    const schema = productSchema(products[0]);

    expect(schema["@type"]).toBe("Product");
    expect(schema.name).toBe(products[0].name);
    expect(schema.brand).toMatchObject({ name: business.name });
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

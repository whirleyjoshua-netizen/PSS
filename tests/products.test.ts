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
    expect(getCategory("drapery")).toBeUndefined();
    expect(products.some((p) => p.category === "drapery")).toBe(false);
  });

  it("has sixteen child products", () => {
    expect(products).toHaveLength(16);
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
    expect(allProductPaths()).toHaveLength(16);
    expect(allProductPaths()).toContainEqual({
      category: "shades",
      product: "solar-shades",
    });
  });
});

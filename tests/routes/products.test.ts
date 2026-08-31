import { describe, it, expect } from "vitest";
import { generateStaticParams as categoryParams } from "@/app/[category]/page";
import { generateStaticParams as productParams } from "@/app/[category]/[product]/page";

describe("static params", () => {
  it("generates one route per category", async () => {
    expect(await categoryParams()).toHaveLength(5);
  });

  it("generates one route per child product", async () => {
    expect(await productParams()).toHaveLength(16);
  });

  it("scopes product routes to their own category", async () => {
    const params = await productParams();

    expect(params).toContainEqual({ category: "shades", product: "solar-shades" });
    expect(params).not.toContainEqual({ category: "blinds", product: "solar-shades" });
  });

  it("emits no drapery route", async () => {
    const params = await categoryParams();
    expect(params).not.toContainEqual({ category: "drapery" });
  });
});

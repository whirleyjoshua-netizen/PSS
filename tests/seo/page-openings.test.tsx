import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import CityPage from "@/app/(site)/service-area/[city]/page";
import { FAMILY_LINE } from "@/components/booking/PromiseRow";
import { products } from "@/content/products";
import { cities } from "@/content/cities";
import { WARRANTY, WARRANTY_LINE } from "@/content/warranty";
import { LEAD_TIME_LINE } from "@/content/consultation";

/** "wood-blinds" -> "wood blinds": the keyword the page's URL already targets. */
const keyword = (slug: string) => slug.replace(/-/g, " ");

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * SEO audit 2026-10-13: every product and city page opened with the same pasted
 * family paragraph under the promise badges. Each now opens with its own line.
 */
describe("product openings", () => {
  it("are unique and never the shared family line", () => {
    const openings = products.map((p) => p.opening);
    expect(new Set(openings).size).toBe(products.length);
    expect(openings).not.toContain(FAMILY_LINE);
  });

  it.each(products.map((p) => [p.slug, p] as const))("%s names its product and is one or two sentences", (slug, product) => {
    expect(product.opening.toLowerCase()).toContain(keyword(slug));
    expect(product.opening.match(/[.!?](\s|$)/g)?.length ?? 0).toBeLessThanOrEqual(2);
    expect(product.opening.endsWith(".")).toBe(true);
  });

  it.each(products.map((p) => [p.slug, p] as const))("%s renders its opening in place of the family line", async (_slug, product) => {
    const { container } = render(
      await ProductPage({ params: Promise.resolve({ category: product.category, product: product.slug }) }),
    );
    expect(screen.getByText(product.opening)).toBeInTheDocument();
    expect(container.textContent).not.toContain(FAMILY_LINE);
  });
});

describe("city openings", () => {
  it("are unique and never the shared family line", () => {
    const openings = cities.map((c) => c.opening);
    expect(new Set(openings).size).toBe(cities.length);
    expect(openings).not.toContain(FAMILY_LINE);
  });

  it.each(cities.map((c) => [c.slug, c] as const))("%s names its city", (_slug, city) => {
    expect(city.opening).toContain(city.name);
    expect(city.opening.endsWith(".")).toBe(true);
  });

  it("give every popular product its own reason, different in every city", () => {
    const reasons = cities.flatMap((c) => c.popularProducts.map((p) => p.why));
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const reason of reasons) expect(reason.length).toBeGreaterThan(40);
  });
});

describe.each(cities.map((c) => [c.slug, c] as const))("/service-area/%s", (slug, city) => {
  it("renders its opening in place of the family line", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    expect(screen.getByText(city.opening)).toBeInTheDocument();
    expect(container.textContent).not.toContain(FAMILY_LINE);
  });

  it("links what we install most, with why, and the lead time and warranty from their sources", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    expect(screen.getByRole("heading", { level: 2, name: `What we install most in ${city.name}.` })).toBeInTheDocument();
    for (const product of city.popularProducts) {
      expect(screen.getByRole("link", { name: product.name })).toHaveAttribute("href", product.href);
      expect(screen.getByText(product.why)).toBeInTheDocument();
    }
    const text = container.textContent ?? "";
    expect(text).toContain(`${LEAD_TIME_LINE}, counted from the day you order`);
    expect(text).toContain(WARRANTY_LINE);
    expect(text).toContain(WARRANTY.fineprint);
    expect(text).toMatch(/measurement guarantee/);
  });

  it("adds at least 150 words of city copy over the old page (audit: 335-393 words)", async () => {
    render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    const sectionOf = (name: string) => screen.getByRole("heading", { level: 2, name }).closest("section")!;
    const added =
      words(sectionOf(`What we install most in ${city.name}.`).textContent ?? "") +
      words(sectionOf(`How a ${city.name} project works.`).textContent ?? "");
    expect(added).toBeGreaterThanOrEqual(150);
  });

  it("keeps its noun-phrase headline bare", async () => {
    render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    expect(screen.getByRole("heading", { level: 1, name: `Window treatments in ${city.name}, NV` })).toBeInTheDocument();
  });

  it("shows the same trail it publishes, Home then the city, with no crumb linking to itself", async () => {
    render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const items = Array.from(nav.querySelectorAll("li")).map((li) => li.textContent?.replace("/", "").trim());
    expect(items).toEqual(["Home", city.name]);
    const links = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/"]);
  });

  it("publishes a BreadcrumbList, Home then the city", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    const schemas = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
      JSON.parse(s.textContent ?? "{}"),
    );
    const crumbs = schemas.find((s) => s["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Home", city.name]);
    expect(crumbs.itemListElement[1].item).toBe(`https://premiershadesolutions.com/service-area/${slug}`);
  });
});

describe("product warranties", () => {
  it("never repeat the old vague claim, and no product carries its own copy of the line", () => {
    expect(JSON.stringify(products)).not.toMatch(/strong manufacturer warranties/);
    for (const product of products) expect(product.features).not.toContain(WARRANTY_LINE);
  });

  it.each(products.filter((p) => p.category !== "outdoor").map((p) => [p.slug, p] as const))(
    "%s shows the warranty line exactly once, with its fine print",
    async (_slug, product) => {
      const { container } = render(
        await ProductPage({ params: Promise.resolve({ category: product.category, product: product.slug }) }),
      );
      const text = container.textContent ?? "";
      expect(text.split(WARRANTY_LINE).length - 1).toBe(1);
      expect(text).toContain(WARRANTY.fineprint);
    },
  );

  // The published lifetime warranty covers blinds, shades and shutters; it must not read as a claim for exterior screens.
  it.each(products.filter((p) => p.category === "outdoor").map((p) => [p.slug, p] as const))(
    "%s (outdoor) carries no warranty line",
    async (_slug, product) => {
      const { container } = render(
        await ProductPage({ params: Promise.resolve({ category: product.category, product: product.slug }) }),
      );
      expect(container.textContent).not.toContain(WARRANTY_LINE);
    },
  );
});

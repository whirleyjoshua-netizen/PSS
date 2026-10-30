import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CategoryPage from "@/app/(site)/[category]/page";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import CityPage from "@/app/(site)/service-area/[city]/page";
import { categories, products } from "@/content/products";
import { cities } from "@/content/cities";
import { PAGE_FAQS, faqsFor } from "@/content/page-faqs";
import { FAQ_GROUPS } from "@/content/faq";
import { leadTimes } from "@/content/lead-times";

const schemas = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) => JSON.parse(s.textContent ?? "{}"));

/** The FAQ block's visible questions must be exactly what its FAQPage markup says. */
function expectFaqMatchesMarkup(container: HTMLElement, heading: string, path: string) {
  const section = screen.getByRole("heading", { level: 2, name: heading }).closest("section")!;
  const shown = Array.from(section.querySelectorAll("h3")).map((h) => h.textContent);
  const faq = schemas(container).find((s) => s["@type"] === "FAQPage");
  expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(shown);
  expect(shown).toEqual(faqsFor(path).map((item) => item.q));
  expect(shown.length).toBeGreaterThanOrEqual(4);
  // No link back to this page, and none to /contact: the page has its own form.
  const hrefs = Array.from(section.querySelectorAll("a")).map((a) => a.getAttribute("href"));
  expect(hrefs).not.toContain(`/${path}`);
  expect(hrefs).not.toContain("/contact");
  expect(within(section).getByRole("link", { name: "questions page" })).toHaveAttribute("href", "/faq");
}

describe("page FAQs (owner 2026-10-21, SEO plan)", () => {
  it("covers every category, product and city page, with answers /faq really gives", () => {
    const paths = [
      ...categories.map((c) => c.slug),
      ...products.map((p) => `${p.category}/${p.slug}`),
      ...cities.map((c) => `service-area/${c.slug}`),
    ];
    expect(Object.keys(PAGE_FAQS).sort()).toEqual(paths.sort());
    const all = FAQ_GROUPS.flatMap((g) => g.items);
    for (const path of paths) for (const item of faqsFor(path)) expect(all).toContain(item);
  });

  it("refuses a question /faq doesn't answer", () => {
    PAGE_FAQS["test/page"] = ["Do you sell drapes?"];
    expect(() => faqsFor("test/page")).toThrow(/No \/faq answer/);
    delete PAGE_FAQS["test/page"];
  });

  it.each(products.map((p) => [p.category, p.slug, p.name] as const))("/%s/%s shows its questions and marks them up", async (category, slug, name) => {
    const { container } = render(await ProductPage({ params: Promise.resolve({ category, product: slug }) }));
    expectFaqMatchesMarkup(container, `Questions about ${name.toLowerCase()}.`, `${category}/${slug}`);
  });

  it.each(cities.map((c) => [c.slug, c.name] as const))("/service-area/%s shows its questions and marks them up", async (slug, name) => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    expectFaqMatchesMarkup(container, `Questions from ${name} homeowners.`, `service-area/${slug}`);
  });

  it("puts the category pages' questions up too, and marks each category up as a Service", async () => {
    for (const category of categories) {
      const { container, unmount } = render(await CategoryPage({ params: Promise.resolve({ category: category.slug }) }));
      expectFaqMatchesMarkup(container, `Questions about ${(category.heading ?? category.name).toLowerCase()}.`, category.slug);
      const service = schemas(container).find((s) => s["@type"] === "Service");
      expect(service).toMatchObject({ name: category.name, url: `https://premiershadesolutions.com/${category.slug}` });
      unmount();
    }
  });

  it("heads the motorization page with the words people search for", async () => {
    render(await CategoryPage({ params: Promise.resolve({ category: "motorization" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Motorized Shades and Blinds in Las Vegas");
  });

  // SEO audit 2026-10-27: Google tests the plantation page for "plantation shutter installation" (position 13).
  it("answers installation on the plantation shutters page, with the contract's shutter weeks", async () => {
    const { container } = render(
      await ProductPage({ params: Promise.resolve({ category: "shutters", product: "plantation-shutters" }) }),
    );
    expect(faqsFor("shutters/plantation-shutters")[0].q).toBe("Do my windows need to be professionally measured?");
    const shutters = leadTimes.find((l) => l.label === "Shutters")!;
    expect(container.textContent).toContain(
      "Plantation shutter installation is done by the two of us, never a subcontractor, across Las Vegas, Henderson, Summerlin and North Las Vegas and out to Pahrump and Mesquite.",
    );
    expect(container.textContent).toContain(`Shutters take ${shutters.minWeeks} to ${shutters.maxWeeks} weeks, counted from the day you order`);
  });

  it("heads the shades page with the words people search for", async () => {
    render(await CategoryPage({ params: Promise.resolve({ category: "shades" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Window Shades in Las Vegas");
  });
});

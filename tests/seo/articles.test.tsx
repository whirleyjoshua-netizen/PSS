import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ArticlePage, { generateMetadata } from "@/app/(site)/learn/[slug]/page";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import FaqPage from "@/app/(site)/faq/page";
import CityPage from "@/app/(site)/service-area/[city]/page";
import { HELD_ARTICLES, articles } from "@/content/articles";
import sitemap from "@/app/sitemap";
import { generateStaticParams } from "@/app/(site)/learn/[slug]/page";
import { cities } from "@/content/cities";
import { products, categories } from "@/content/products";

const schemas = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) => JSON.parse(s.textContent ?? "{}"));

describe("buying guides (SEO plan drafts, 2026-10-22)", () => {
  it.each(articles.map((a) => [a.slug, a] as const))("/learn/%s has one H1, an Article, a quick answer and the form", async (slug, article) => {
    const { container } = render(await ArticlePage({ params: Promise.resolve({ slug }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(article.title);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByText(article.quickAnswer)).toBeInTheDocument();
    expect(schemas(container).find((s) => s["@type"] === "Article")).toMatchObject({
      headline: article.title, url: `https://premiershadesolutions.com/learn/${slug}`, dateModified: article.updated,
    });
    expect(container.querySelectorAll("form")).toHaveLength(1);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(metadata.alternates?.canonical).toBe(`/learn/${slug}`);
    expect((metadata.description as string).length).toBeLessThanOrEqual(160);
    expect((metadata.title as string).length).toBeLessThanOrEqual(60);
  });

  it("links only to pages that exist", () => {
    const known = new Set([...categories.map((c) => `/${c.slug}`), ...products.map((p) => `/${p.category}/${p.slug}`)]);
    for (const article of articles) for (const product of article.products) expect(known).toContain(product.href);
  });

  it("calls us authorized only for Hunter Douglas, and never quotes a price or promises a saving", () => {
    for (const article of articles) {
      const text = JSON.stringify(article);
      expect(text.replace(/Authorized Hunter Douglas Dealer/g, "")).not.toMatch(/authorized|\$\d|save \d|\d+% (off|savings)/i);
    }
  });

  it("is linked from the product pages it covers and from /faq", async () => {
    const solar = render(await ProductPage({ params: Promise.resolve({ category: "shades", product: "solar-shades" }) }));
    expect(within(solar.container).getByRole("link", { name: /Solar screens vs\. solar shades/ })).toHaveAttribute("href", "/learn/solar-screens-vs-solar-shades");
    solar.unmount();
    render(<FaqPage />);
    for (const article of articles) expect(screen.getByRole("link", { name: new RegExp(article.title.slice(0, 20)) })).toHaveAttribute("href", `/learn/${article.slug}`);
  });
});

describe("the brands guide (owner 2026-10-22: approved to use our vendors' names)", () => {
  it("is published", async () => {
    expect(HELD_ARTICLES).toHaveLength(0);
    expect((await generateStaticParams()).map((p) => p.slug)).toContain("hunter-douglas-alta-norman-las-vegas");
    expect(sitemap().some((e) => e.url.endsWith("/learn/hunter-douglas-alta-norman-las-vegas"))).toBe(true);
  });
});

describe("deeper city pages", () => {
  it("names no neighborhood or builder it could not confirm", () => {
    const text = cities.flatMap((c) => c.local.map((l) => l.body)).join(" ");
    expect(text).not.toMatch(/Maryland Parkway|Spring Valley|Inspirada|Cadence|Aliante|Lennar|KB Home/);
  });

  it.each(cities.map((c) => [c.slug, c] as const))("/service-area/%s shows its three local sections", async (slug, city) => {
    render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    const section = screen.getByRole("heading", { level: 2, name: `Window treatments for ${city.name} homes.` }).closest("section")!;
    expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(city.local.map((l) => l.heading));
  });

  it("promises the HOA check on exterior orders (owner 2026-10-22)", () => {
    const summerlin = cities.find((c) => c.slug === "summerlin")!;
    expect(summerlin.local.map((l) => l.body).join(" ")).toMatch(/we check it against your village's guidelines with you/);
  });

  it("says something different in every city", () => {
    const bodies = cities.flatMap((c) => c.local.map((l) => l.body));
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});

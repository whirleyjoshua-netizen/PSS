import { existsSync } from "node:fs";
import path from "node:path";
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

  // Owner 2026-10-28: guides show our own installs, with the gallery's alt text and caption.
  it("shows the west-facing guide's install photos under their sections", async () => {
    const article = articles.find((a) => a.slug === "west-facing-windows-las-vegas")!;
    const photos = article.sections.flatMap((section) => (section.photo ? [section.photo] : []));
    expect(photos.map((p) => p.src)).toEqual([
      "/gallery/solar-shades-balcony-view.webp",
      "/gallery/cellular-shades-great-room-motorized.webp",
    ]);
    const { container } = render(await ArticlePage({ params: Promise.resolve({ slug: article.slug }) }));
    for (const photo of photos) {
      const img = container.querySelector(`img[alt="${photo.alt}"]`);
      expect(img, photo.src).not.toBeNull();
      expect(img!.closest("figure")!.textContent).toContain(photo.caption!);
    }
  });

  it("only uses install photos that exist", () => {
    for (const article of articles)
      for (const section of article.sections)
        if (section.photo) expect(existsSync(path.join(process.cwd(), "public", section.photo.src)), section.photo.src).toBe(true);
  });
});

describe("the roman shades guide (keyword gap 2026-11-03)", () => {
  const roman = articles.find((a) => a.slug === "roman-shades-las-vegas")!;

  it("shows our own roman installs and links back from the roman shades page", async () => {
    expect(roman.sections.flatMap((s) => (s.photo ? [s.photo.src] : []))).toEqual([
      "/gallery/roman-shades-primary-bath.webp",
      "/gallery/roman-shades-woven-dining-room.webp",
    ]);
    render(await ProductPage({ params: Promise.resolve({ category: "shades", product: "roman-shades" }) }));
    expect(screen.getByRole("link", { name: /Roman shades in Las Vegas/ })).toHaveAttribute("href", "/learn/roman-shades-las-vegas");
  });

  // Alta's BLISS motors list roller, woven wood, honeycomb, sheer, banded, wood and faux wood styles: not roman.
  it("offers cordless lift, never motorization, for roman shades", () => {
    const text = JSON.stringify(roman.sections);
    expect(text).toMatch(/cordless lift/);
    expect(text).not.toMatch(/motoriz|BLISS/i);
  });
});

describe("the cellular shades energy guide (content pipeline, queue item 1)", () => {
  const cellular = articles.find((a) => a.slug === "cellular-shades-energy-las-vegas")!;
  const text = JSON.stringify(cellular);

  it("shows our own cellular installs and links back from the cellular shades page", async () => {
    expect(cellular.sections.flatMap((s) => (s.photo ? [s.photo.src] : []))).toEqual([
      "/gallery/cellular-shades-sitting-room.webp",
      "/gallery/cellular-shades-top-down-bedroom.webp",
    ]);
    render(await ProductPage({ params: Promise.resolve({ category: "shades", product: "cellular-shades" }) }));
    expect(screen.getByRole("link", { name: /Cellular shades in Las Vegas/ })).toHaveAttribute("href", "/learn/cellular-shades-energy-las-vegas");
  });

  // Research brief "Do NOT claim": no savings figures or R-values, no promise of a truly dark cellular room, no
  // side channels for cellular, no Hunter Douglas product names, no drapes.
  it("promises no number, no R-value and no cellular side channels", () => {
    expect(text).toMatch(/won't promise you a number/);
    expect(text).not.toMatch(/R-?value|pays for itself|\d+% (of )?(savings|less|more)|25%|low-e|reflective/i);
    expect(text).not.toMatch(/drape|curtain|®[^"]*Hunter|Honeycomb Shades®|Duette/i);
    for (const section of cellular.sections)
      for (const p of section.paragraphs) if (/side channels/.test(p)) expect(p).toMatch(/blackout roller shade with side channels/);
  });

  it("keeps the 70–90% heat figure on solar screens only, and says exterior shading wins", () => {
    const screens = cellular.sections.flatMap((s) => s.paragraphs).filter((p) => /70–90%/.test(p));
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatch(/exterior solar screen/);
    expect(text).not.toMatch(/best (treatment|product) for Las Vegas heat/i);
  });

  // Owner answers (docs/content-pipeline/cellular-shades-energy-las-vegas/owner-answers.md).
  it("follows the owner answers: double cell, cordless option, AERC Warm Climate, rollers stay the day-sleeper answer", () => {
    expect(text).toMatch(/double cell, with 1½-inch cells rather than ¾-inch/);
    expect(text).toMatch(/Cordless is an option on every cellular shade we sell/);
    expect(text).toMatch(/Some of the cellular shades we carry have an energy rating/);
    expect(text).toMatch(/Warm Climate rating is the one to look at/);
    expect(text).not.toMatch(/(Alta|Norman)[^.]*AERC|AERC[^.]*(Alta|Norman)/);
    expect(text).toMatch(/blackout cellular shade is a strong option/);
    expect(text).toMatch(/most reliable setup for a truly dark room is still a blackout roller shade with side channels/);
  });
});

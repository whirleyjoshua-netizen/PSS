import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import sitemap from "@/app/sitemap";
import Home from "@/app/(site)/page";
import CategoryPage from "@/app/(site)/[category]/page";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import CityPage from "@/app/(site)/service-area/[city]/page";
import ContactPage from "@/app/(site)/contact/page";
import AboutPage from "@/app/(site)/about/page";
import GalleryPage from "@/app/(site)/gallery/page";
import ReviewsPage from "@/app/(site)/reviews/page";
import { categories, products } from "@/content/products";
import { cities } from "@/content/cities";

/** Legal text. The owner decides whether these get a photo (spec §8). */
const EXEMPT = ["/privacy", "/accessibility"];

const PAGES: [string, () => ReactElement | Promise<ReactElement>][] = [
  ["/", () => <Home />],
  ...categories.map((c) => [`/${c.slug}`, () => CategoryPage({ params: Promise.resolve({ category: c.slug }) })] as [string, () => Promise<ReactElement>]),
  ...products.map((p) => [`/${p.category}/${p.slug}`, () => ProductPage({ params: Promise.resolve({ category: p.category, product: p.slug }) })] as [string, () => Promise<ReactElement>]),
  ...cities.map((c) => [`/service-area/${c.slug}`, () => CityPage({ params: Promise.resolve({ city: c.slug }) })] as [string, () => Promise<ReactElement>]),
  ["/contact", () => <ContactPage />],
  ["/about", () => <AboutPage />],
  ["/gallery", () => <GalleryPage />],
  ["/reviews", () => <ReviewsPage />],
];

describe("every page has at least one photo", () => {
  it("checks every page in the sitemap, so a new page cannot slip through", () => {
    const inSitemap = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .filter((path) => !EXEMPT.includes(path));
    expect([...inSitemap].sort()).toEqual(PAGES.map(([path]) => path).sort());
  });

  it.each(PAGES)("%s shows a photo with alt text", async (_path, make) => {
    const { container } = render(await make());
    const described = Array.from(container.querySelectorAll("img")).filter(
      (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
    );
    expect(described.length).toBeGreaterThan(0);
  });
});

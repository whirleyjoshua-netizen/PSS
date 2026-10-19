import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { Metadata } from "next";
import {
  generateMetadata as categoryMetadata,
  generateStaticParams as categoryParams,
} from "@/app/(site)/[category]/page";
import {
  generateMetadata as productMetadata,
  generateStaticParams as productParams,
} from "@/app/(site)/[category]/[product]/page";
import {
  generateMetadata as cityMetadata,
  generateStaticParams as cityParams,
} from "@/app/(site)/service-area/[city]/page";
import { business } from "@/content/business";

type Route = [string, () => Promise<Metadata>];

const routes = async (): Promise<Route[]> => [
  ...(await categoryParams()).map(
    (p): Route => [`/${p.category}`, () => categoryMetadata({ params: Promise.resolve(p) })],
  ),
  ...(await productParams()).map(
    (p): Route => [`/${p.category}/${p.product}`, () => productMetadata({ params: Promise.resolve(p) })],
  ),
  ...(await cityParams()).map(
    (p): Route => [`/service-area/${p.city}`, () => cityMetadata({ params: Promise.resolve(p) })],
  ),
];

type Image = { url: string; alt?: string; width?: number; height?: number };
const firstImage = (images: unknown): Image | undefined => {
  const list = Array.isArray(images) ? images : images ? [images] : [];
  return list[0] as Image | undefined;
};

/**
 * A page that sets its own openGraph replaces the inherited one, image and all
 * (audit 2026-10-13: 23 money pages shared with no picture).
 */
const all = await routes();

describe("every category, product and city page shares with a picture", () => {
  it("covers all 21 money pages", () => {
    expect(all).toHaveLength(5 + 12 + 4);
  });

  it.each(all)("%s has a sized JPEG og image that exists, a large Twitter card, and the site name", async (route, load) => {
    const metadata = await load();
    const og = metadata.openGraph as Record<string, unknown>;
    const image = firstImage(og.images);

    // JPEG, not the page's WebP: some share previews skip WebP (tests/seo/og-images.test.ts checks the files).
    expect(image?.url, route).toMatch(/^\/og\/.+\.jpg$/);
    expect(image?.width).toBeGreaterThan(0);
    expect(image?.height).toBeGreaterThan(0);
    expect(existsSync(path.join(process.cwd(), "public", image!.url))).toBe(true);
    expect(image?.alt?.length).toBeGreaterThan(10);
    expect(og.url).toBe(route);
    expect(og.siteName).toBe(business.name);
    expect(metadata.alternates?.canonical).toBe(route);
    expect((metadata.twitter as { card?: string }).card).toBe("summary_large_image");
  });
});

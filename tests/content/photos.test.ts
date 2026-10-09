import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { categories, products, type Photo } from "@/content/products";
import { consultationPhoto, gallery } from "@/content/gallery";
import { altaPhotos } from "@/content/stock-photos";

const onDisk = (src: string) => existsSync(path.join(process.cwd(), "public", src));
const stock = Object.values(altaPhotos);

const pagePhotos: [string, Photo][] = [
  ["consultation", consultationPhoto],
  ...categories.flatMap((c) => [c.image, c.bookingPhoto].flatMap((p) => (p ? [[c.slug, p] as [string, Photo]] : []))),
  ...products.flatMap((p) => [p.image, p.storyPhoto].flatMap((photo) => (photo ? [[p.slug, photo] as [string, Photo]] : []))),
];

/**
 * Owner rule (2026-10-09): heroes and info photos are professional Alta stock
 * photos; the gallery is real work only. Our own installs stay on a page only
 * where Alta has no photo of that product.
 */
describe("photos in the content model", () => {
  it("gives every product a hero photo except Solar Screens, which Alta has no photo of", () => {
    expect(products.filter((product) => !product.image).map((product) => product.slug)).toEqual(["solar-screens"]);
  });

  it("uses Alta photos (with their alt text) or our own install photos, nothing else", () => {
    for (const [where, photo] of pagePhotos) {
      if (photo.src.startsWith("/stock/")) expect(stock, `${where}: ${photo.src}`).toContainEqual(photo);
      else expect(photo.src, where).toMatch(/^\/gallery\//);
    }
  });

  it("keeps the gallery real work only: no stock photo is ever in it", () => {
    expect(gallery.filter((item) => item.src.startsWith("/stock/"))).toEqual([]);
  });

  it("never describes a stock photo as our own work", () => {
    for (const photo of stock) expect(photo.alt, photo.src).not.toMatch(/\b(our|we|installed by|client)\b/i);
  });

  it("gives Blinds the Alta faux wood photo beside its intro", () => {
    expect(categories.find((category) => category.slug === "blinds")?.image).toEqual(altaPhotos.fauxWoodLivingRoom);
  });

  it("points every photo at a real file with real alt text", () => {
    for (const photo of [...stock, ...pagePhotos.map(([, p]) => p)]) {
      expect(onDisk(photo.src), photo.src).toBe(true);
      expect(photo.alt.trim().length, photo.src).toBeGreaterThan(20);
    }
  });

  it("uses the Alta sheer shadings dining room as the stand-in, and never a family photo", () => {
    expect(consultationPhoto).toEqual(altaPhotos.sheerShadingsDiningRoom);
    expect(consultationPhoto.src).not.toMatch(/^\/brand\//);
  });

  // Owner 2026-10-01: that photo showed too much of a client's home and is gone from the site.
  it("never brings back the old living-room stand-in", () => {
    expect(gallery.some((item) => item.src === "/gallery/shades-open-living-room.webp")).toBe(false);
    expect(onDisk("/gallery/shades-open-living-room.webp")).toBe(false);
  });
});

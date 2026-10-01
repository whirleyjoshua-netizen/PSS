import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { categories, products } from "@/content/products";
import { consultationPhoto, gallery } from "@/content/gallery";

const onDisk = (src: string) => existsSync(path.join(process.cwd(), "public", src));

/** Spec §8: only photos that truly show the product. Changing this list is an owner decision. */
const PRODUCT_PHOTOS: Record<string, string> = {
  "vertical-blinds": "/gallery/sheer-vertical-patio-slider.webp",
  "wood-blinds": "/gallery/faux-wood-blinds-living-room.webp",
  "roller-shades": "/gallery/roller-shades-bay-window.webp",
  "cellular-shades": "/gallery/cellular-shades-great-room.webp",
  "transitional-shades": "/gallery/transitional-shades-slider-wall.webp",
  "plantation-shutters": "/gallery/plantation-shutters-dining-room.webp",
};

describe("photos in the content model", () => {
  it("gives exactly the approved products a photo", () => {
    const withPhoto = Object.fromEntries(
      products.filter((product) => product.image).map((product) => [product.slug, product.image!.src]),
    );
    expect(withPhoto).toEqual(PRODUCT_PHOTOS);
  });

  it("uses only our own gallery photos for products, with the gallery's reviewed alt text", () => {
    for (const product of products) {
      if (!product.image) continue;
      const match = gallery.find((item) => item.src === product.image!.src);
      expect(match, product.slug).toBeDefined();
      expect(product.image.alt).toBe(match!.alt);
    }
  });

  it("gives Blinds the faux wood photo beside its intro", () => {
    expect(categories.find((category) => category.slug === "blinds")?.image?.src).toBe(
      "/gallery/faux-wood-blinds-living-room.webp",
    );
  });

  it("points every photo at a real file with real alt text", () => {
    const photos = [
      consultationPhoto,
      ...categories.flatMap((category) => (category.image ? [category.image] : [])),
      ...products.flatMap((product) => (product.image ? [product.image] : [])),
    ];
    for (const photo of photos) {
      expect(onDisk(photo.src), photo.src).toBe(true);
      expect(photo.alt.trim().length, photo.src).toBeGreaterThan(20);
    }
  });

  it("takes the consultation photo's alt text from its reviewed gallery entry", () => {
    const match = gallery.find((item) => item.src === consultationPhoto.src);
    expect(match).toBeDefined();
    expect(consultationPhoto).toEqual({ src: match!.src, alt: match!.alt });
  });

  it("never uses a family photo as the consultation stand-in", () => {
    expect(consultationPhoto.src).not.toMatch(/^\/brand\//);
  });
});

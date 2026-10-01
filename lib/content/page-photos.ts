import type { Photo } from "@/content/products";

/**
 * The photo each slot on a page shows, filled top to bottom (hero, story, cards).
 * A slot whose photo already appeared higher up gets `undefined`, and the page
 * shows the fabric panel there instead: no page ever repeats a photo (spec
 * 2026-10-01 §6).
 */
export function uniquePhotos(slots: (Photo | undefined)[]): (Photo | undefined)[] {
  const seen = new Set<string>();
  return slots.map((photo) => {
    if (!photo || seen.has(photo.src)) return undefined;
    seen.add(photo.src);
    return photo;
  });
}

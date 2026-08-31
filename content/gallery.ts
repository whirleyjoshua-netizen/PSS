import type { CategorySlug } from "./products";

export type GalleryItem = {
  src: string;
  alt: string;
  treatment: CategorySlug;
  city: string;
  caption?: string;
};

/**
 * TODO(content): replace with real job photographs.
 *
 * Deliberately empty. Stock imagery of someone else's installations is the
 * fastest way to lose a customer who recognizes it, and the gallery is the
 * page where a local company's real work does the selling. Every consumer
 * renders an honest empty state until these arrive.
 *
 * When adding: use 4:3 or 3:2 landscape, at least 1600px wide, and write alt
 * text describing the treatment and the room — it is read aloud and indexed.
 */
export const gallery: GalleryItem[] = [];

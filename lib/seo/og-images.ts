/**
 * JPEG copies of the photos pages share as their Open Graph image. The pages show WebP, but some share previews
 * (LinkedIn among them) skip WebP, and crawlers lay a card out faster when told its size. Made with
 *   sips -s format jpeg -s formatOptions 82 -Z 1200 public/<photo>.webp --out public/og/<name>.jpg
 * Keyed by the WebP's path; tests/seo/og-images.test.ts checks every file, its size and these dimensions.
 */
export type OgImage = { url: string; width: number; height: number };

export const OG_IMAGES: Record<string, OgImage> = {
  "/stock/alta/wood-blinds-kitchen-motorized.webp": { url: "/og/wood-blinds-kitchen-motorized.jpg", width: 1200, height: 675 },
  "/stock/alta/honeycomb-shades-living-room.webp": { url: "/og/honeycomb-shades-living-room.jpg", width: 1200, height: 743 },
  "/stock/alta/shutters-french-doors.webp": { url: "/og/shutters-french-doors.jpg", width: 1200, height: 774 },
  "/stock/alta/sheer-shadings-dining-room.webp": { url: "/og/sheer-shadings-dining-room.jpg", width: 1200, height: 646 },
  "/stock/alta/roller-shades-kitchen-motorized.webp": { url: "/og/roller-shades-kitchen-motorized.jpg", width: 1200, height: 825 },
  "/stock/alta/vertical-blinds-dining-room.webp": { url: "/og/vertical-blinds-dining-room.jpg", width: 1200, height: 776 },
  "/stock/alta/wood-blinds-cornice.webp": { url: "/og/wood-blinds-cornice.jpg", width: 1200, height: 800 },
  "/stock/alta/roller-shades-bedroom.webp": { url: "/og/roller-shades-bedroom.jpg", width: 1200, height: 776 },
  "/stock/alta/roller-shades-sunroom.webp": { url: "/og/roller-shades-sunroom.jpg", width: 1200, height: 709 },
  "/stock/alta/honeycomb-shades-entry.webp": { url: "/og/honeycomb-shades-entry.jpg", width: 1200, height: 804 },
  "/gallery/roman-shades-woven-dining-room.webp": { url: "/og/roman-shades-woven-dining-room.jpg", width: 1200, height: 680 },
  "/stock/alta/woven-shades-bedroom.webp": { url: "/og/woven-shades-bedroom.jpg", width: 1200, height: 776 },
  "/stock/alta/banded-shades-living-room.webp": { url: "/og/banded-shades-living-room.jpg", width: 1200, height: 706 },
  "/stock/alta/shutters-kitchen.webp": { url: "/og/shutters-kitchen.jpg", width: 1200, height: 908 },
  "/stock/alta/composite-shutters-dining-room.webp": { url: "/og/composite-shutters-dining-room.jpg", width: 1200, height: 918 },
  "/stock/alta/wood-shutters-kitchen.webp": { url: "/og/wood-shutters-kitchen.jpg", width: 1200, height: 833 },
  "/gallery/transitional-shades-slider-wall.webp": { url: "/og/transitional-shades-slider-wall.jpg", width: 1200, height: 648 },
};

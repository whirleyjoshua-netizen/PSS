import type { CategorySlug } from "./products";

export type GalleryItem = {
  src: string;
  alt: string;
  treatment: CategorySlug;
  city: string;
  caption?: string;
};

/**
 * Real installations, photographed on the job. Sources live in `Images/` and
 * are converted to 1800px-wide WebP under `public/gallery/`.
 *
 * When adding: use 4:3 or 3:2 landscape, at least 1600px wide, and write alt
 * text describing the treatment and the room — it is read aloud and indexed.
 */
export const gallery: GalleryItem[] = [
  {
    src: "/gallery/transitional-shades-slider-wall.webp",
    alt: "Charcoal transitional sheer shades raised across a four-panel glass slider wall in a living room, with a river and balcony seating visible beyond.",
    treatment: "shades",
    city: "Columbus, OH",
    caption:
      "Transitional sheer shades across a full slider wall — the banded fabric cuts glare off the water without giving up the view.",
  },
  {
    src: "/gallery/plantation-shutters-bath.webp",
    alt: "White plantation shutters with wide louvers on a primary bathroom window above a soaking tub.",
    treatment: "shutters",
    city: "Las Vegas, NV",
    caption:
      "Plantation shutters in a primary bath — louvers tilt for daylight while the panels stay closed for privacy.",
  },
  {
    src: "/gallery/sheer-vertical-patio-slider.webp",
    alt: "Floor-to-ceiling sheer vertical blinds drawn across a patio slider in a living room, with the backyard visible through the fabric vanes.",
    treatment: "blinds",
    city: "Dayton, OH",
    caption:
      "Sheer vertical blinds on a patio slider — they stack clear of the door and soften the light instead of blocking it.",
  },
  {
    src: "/gallery/cellular-shades-tall-windows.webp",
    alt: "Top-down bottom-up cellular shades raised from the sill on a wall of tall windows in a living room, leaving the upper glass clear.",
    treatment: "shades",
    city: "Columbus, OH",
    caption:
      "Top-down bottom-up cellular shades — privacy at eye level, daylight and treetops left uncovered above.",
  },
  {
    src: "/gallery/cellular-shades-great-room.webp",
    alt: "White cellular shades lowered across two rows of windows in a vaulted great room with exposed wood beams and a stone fireplace.",
    treatment: "shades",
    city: "Dayton, OH",
    caption:
      "Two stacked runs of cellular shades in a vaulted great room, sized so the upper and lower banks line up.",
  },
  {
    src: "/gallery/cellular-shades-sitting-room.webp",
    alt: "Light cellular shades lowered on four windows in a sitting room, filtering afternoon sun onto a wood floor.",
    treatment: "shades",
    city: "Las Vegas, NV",
    caption:
      "Cellular shades on a sun-facing sitting room — the honeycomb cells hold heat off the glass through the afternoon.",
  },
];

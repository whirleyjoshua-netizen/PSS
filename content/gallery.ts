import type { CategorySlug, Photo } from "./products";

export type GalleryItem = Photo & { treatment: CategorySlug; caption?: string };

/**
 * Real installations, photographed on the job. Sources live in `Images/` and
 * are converted to 1800px-wide WebP under `public/gallery/` by
 * `scripts/gallery-webp.mjs`, which also strips the photos' GPS data.
 *
 * Most of these are the owners' own work from their years in Ohio, before
 * Premier Shade Solutions; the gallery page says so.
 *
 * When adding: use 4:3 or 3:2 landscape, at least 1600px wide, and write alt
 * text describing the treatment and the room — it is read aloud and indexed.
 */
export const gallery: GalleryItem[] = [
  {
    src: "/gallery/transitional-shades-slider-wall.webp",
    alt: "Charcoal transitional sheer shades raised across a four-panel glass slider wall in a living room, with a river and balcony seating visible beyond.",
    treatment: "shades",
    caption:
      "Transitional sheer shades across a full slider wall — the banded fabric cuts glare off the water without giving up the view.",
  },
  {
    src: "/gallery/plantation-shutters-bath.webp",
    alt: "White plantation shutters with wide louvers on a primary bathroom window above a soaking tub.",
    treatment: "shutters",
    caption:
      "Plantation shutters in a primary bath — louvers tilt for daylight while the panels stay closed for privacy.",
  },
  {
    src: "/gallery/sheer-vertical-patio-slider.webp",
    alt: "Floor-to-ceiling sheer vertical blinds drawn across a patio slider in a living room, with the backyard visible through the fabric vanes.",
    treatment: "blinds",
    caption:
      "Sheer vertical blinds on a patio slider — they stack clear of the door and soften the light instead of blocking it.",
  },
  {
    src: "/gallery/cellular-shades-tall-windows.webp",
    alt: "Top-down bottom-up cellular shades raised from the sill on a wall of tall windows in a living room, leaving the upper glass clear.",
    treatment: "shades",
    caption:
      "Top-down bottom-up cellular shades — privacy at eye level, daylight and treetops left uncovered above.",
  },
  {
    src: "/gallery/cellular-shades-great-room.webp",
    alt: "White cellular shades lowered across two rows of windows in a vaulted great room with exposed wood beams and a stone fireplace.",
    treatment: "shades",
    caption:
      "Two stacked runs of cellular shades in a vaulted great room, sized so the upper and lower banks line up.",
  },
  {
    src: "/gallery/cellular-shades-sitting-room.webp",
    alt: "Light cellular shades lowered on four windows in a sitting room, filtering afternoon sun onto a wood floor.",
    treatment: "shades",
    caption:
      "Cellular shades on a sun-facing sitting room — the honeycomb cells hold heat off the glass through the afternoon.",
  },
  {
    src: "/gallery/plantation-shutters-dining-room.webp",
    alt: "White plantation shutters on three windows in a dining room with blue walls and industrial pendant lights over the table.",
    treatment: "shutters",
    caption: "Plantation shutters on three dining room windows, louvers tilted to soften the light over the table.",
  },
  {
    src: "/gallery/roller-shade-lake-view.webp",
    alt: "A sheer roller shade lowered across a wall of glass in a bedroom, with a deck and a lake visible through the fabric.",
    treatment: "shades",
    caption: "A sheer roller shade on a lakefront wall of glass — the view stays, the glare does not.",
  },
  {
    src: "/gallery/faux-wood-blinds-living-room.webp",
    alt: "White faux wood blinds with wide slats on two windows above a grey sofa with patterned pillows.",
    treatment: "blinds",
    caption: "Faux wood blinds over a living room sofa — the look of painted wood in a slat that will not warp.",
  },
  {
    src: "/gallery/plantation-shutters-french-doors.webp",
    alt: "White plantation shutters mounted on a pair of French doors and on the tall window beside them.",
    treatment: "shutters",
    caption: "Plantation shutters on a pair of French doors and the window beside them.",
  },
  {
    src: "/gallery/roller-shades-bay-window.webp",
    alt: "Light roller shades lowered in each window of a bay, with gridded transom windows left uncovered above.",
    treatment: "shades",
    caption: "Roller shades fitted to each window of a bay, leaving the transoms above clear for daylight.",
  },
  {
    src: "/gallery/cellular-shades-fireplace-wall.webp",
    alt: "White cellular shades lowered on three tall windows beside a white fireplace in a living room.",
    treatment: "shades",
    caption: "Cellular shades on a run of tall living room windows beside the fireplace.",
  },
  {
    src: "/gallery/plantation-shutters-bedroom.webp",
    alt: "White plantation shutters with open louvers on two windows in a bedroom with grey walls.",
    treatment: "shutters",
    caption: "Plantation shutters in a bedroom — louvers open for daylight, closed flat for sleep.",
  },
  {
    src: "/gallery/roller-shades-curved-bay.webp",
    alt: "Roller shades raised to different heights across a curved bay of five windows, with trees visible below and clear transoms above.",
    treatment: "shades",
    caption: "Individual roller shades on a curved five-window bay, each set to its own height.",
  },
  {
    src: "/gallery/roller-shades-bay-closeup.webp",
    alt: "Close view of light grey roller shades in a white-trimmed bay window, one raised to show trees below, with clear transom windows above.",
    treatment: "shades",
    caption: "Roller shades fitted inside each window of a bay, with the transoms left clear for daylight.",
  },
  {
    src: "/gallery/roller-shades-transom-closeup.webp",
    alt: "Grey roller shades lowered in three bay windows beneath gridded transom windows, with white orchids in the foreground.",
    treatment: "shades",
    caption: "Roller shades lowered for privacy in a bay, the gridded transoms above left uncovered.",
  },
  {
    src: "/gallery/cellular-shades-top-down-bedroom.webp",
    alt: "Top-down bottom-up cellular shades covering the lower half of two wood-trimmed windows in a bedroom, with sky visible above.",
    treatment: "shades",
    caption: "Top-down cellular shades on wood-trimmed windows — privacy below, sky above.",
  },
  {
    src: "/gallery/cellular-shades-entry-sidelights.webp",
    alt: "Slim cellular shades on both sidelights of a white front door, with a matching shade on a high window in the entryway.",
    treatment: "shades",
    caption: "Slim cellular shades on front-door sidelights, with a matching shade on the high window above.",
  },
  {
    src: "/gallery/cellular-shades-kitchen-door.webp",
    alt: "Cellular shades on a kitchen patio door and on the windows of a breakfast nook beneath a patterned valance.",
    treatment: "shades",
    caption: "Cellular shades on a patio door and the breakfast-nook windows beside it.",
  },
  {
    src: "/gallery/roller-shades-dining-room.webp",
    alt: "Light textured roller shades in slim cassettes, half raised on four windows around a dining table, with a green yard outside.",
    treatment: "shades",
    caption: "Textured roller shades in matching cassettes around a dining room, raised halfway to keep the yard in view.",
  },
  {
    src: "/gallery/roman-shades-primary-bath.webp",
    alt: "White hobbled roman shades in soft folds on two corner windows above a freestanding tub in a primary bathroom.",
    treatment: "shades",
    caption: "Hobbled roman shades on the corner windows of a primary bath — soft folds even when lowered.",
  },
  {
    src: "/gallery/solar-shades-balcony-view.webp",
    alt: "Two white solar screen shades lowered over balcony doors in a high-rise, with the city still visible through the weave.",
    treatment: "shades",
    caption: "Solar screen shades over balcony doors: the glare and heat stay out, the view stays in.",
  },
  {
    src: "/gallery/solar-shades-long-window.webp",
    alt: "A wide white solar screen shade lowered in a long window, with the shadows of bare trees showing softly through the fabric.",
    treatment: "shades",
    caption: "One wide solar screen shade across a long window, softening the light without closing it off.",
  },
  {
    src: "/gallery/plantation-shutters-primary-bath-pendant.webp",
    alt: "White plantation shutters with louvers tilted open on a wide primary-bathroom window, beside a round wire pendant light above the tub.",
    treatment: "shutters",
    caption: "Plantation shutters in a primary bath, louvers open for light above the tub.",
  },
  {
    src: "/gallery/cellular-shades-great-room-motorized.webp",
    alt: "White cellular shades lowered partway across a wall of tall windows in a wood-paneled great room, with armchairs and a holiday-set dining table in front.",
    treatment: "motorization",
    caption: "Motorized cellular shades across a two-story wall of windows, lowered together to the same line.",
  },
  {
    src: "/gallery/vertical-blinds-patio-door-valance.webp",
    alt: "White vertical blinds drawn across a sliding patio door beneath a grey floral swag valance, with a sunroom visible through the glass.",
    treatment: "blinds",
    caption: "Vertical blinds on a sliding patio door, finished with a swag valance above.",
  },
  {
    src: "/gallery/faux-wood-blinds-front-window.webp",
    alt: "White faux wood blinds with wide slats and cloth tapes in a tall front window, framed by cream curtains, looking out to a covered porch and the street.",
    treatment: "blinds",
    caption: "Faux wood blinds with cloth tapes in a tall front window, under drapery panels.",
  },
  {
    src: "/gallery/roman-shades-woven-dining-room.webp",
    alt: "Three grey woven roman shades raised partway on a row of dining room windows, with a table and chairs below and a green lawn outside.",
    treatment: "shades",
    caption: "Woven roman shades across a row of dining room windows, raised to the same line.",
  },
  {
    src: "/gallery/solar-shades-nursery.webp",
    alt: "Light grey solar roller shades in white cassettes on tall corner windows of a nursery, lowered partway over a sunlit street, beside a rocking chair.",
    treatment: "shades",
    caption: "Solar shades on the tall corner windows of a nursery, cutting the afternoon glare.",
  },
  {
    src: "/gallery/woven-wood-shades-hall-window.webp",
    alt: "A natural woven wood shade lowered over a tall window at the end of a hallway, daylight glowing through the grass weave.",
    treatment: "shades",
    caption: "A woven wood shade on a tall hallway window, the light filtering through the weave.",
  },
];

/**
 * The stand-in wherever a page has no photo of its own: the hero of a
 * category or product we have no photo of, and the booking block on the
 * city pages and /reviews. The owners chose the woven roman dining room
 * (2026-10-01): it shows the work without much of a client's home. Keep it
 * a gallery photo, and never one with the children in it.
 */
export const consultationPhoto: Photo = galleryPhoto("/gallery/roman-shades-woven-dining-room.webp");

/** A gallery photo's src and reviewed alt text; throws at module load if the gallery lacks it. */
function galleryPhoto(src: string): Photo {
  const entry = gallery.find((item) => item.src === src);
  if (!entry) throw new Error(`content/gallery: no gallery entry for ${src}`);
  return { src: entry.src, alt: entry.alt };
}

import type { Photo } from "./products";

/**
 * Professional product photos from the Alta Window Fashions dealer library
 * (dealer.altawindowfashions.com → Visual Assets), downloaded 2026-10-09 with
 * the owner's approval and converted to 1800px WebP under `public/stock/alta/`.
 *
 * Owner rule (2026-10-09): page heroes and info photos come from here; the
 * gallery is real work only, so none of these may ever be added to
 * content/gallery.ts. The alt text describes the room and never calls it our install.
 */
const alta = (file: string, alt: string): Photo => ({ src: `/stock/alta/${file}.webp`, alt });

export const altaPhotos = {
  honeycombLivingRoom: alta(
    "honeycomb-shades-living-room",
    "White honeycomb shades lowered partway on the windows of a bright living room with a vaulted, beamed ceiling and a fireplace.",
  ),
  honeycombEntry: alta(
    "honeycomb-shades-entry",
    "Blue-grey honeycomb shades on a row of tall windows beside a white front door in a sunny entryway.",
  ),
  bandedLivingRoom: alta(
    "banded-shades-living-room",
    "Grey banded shades with alternating sheer and solid stripes across a wide picture window behind a white sectional sofa.",
  ),
  woodShuttersKitchen: alta(
    "wood-shutters-kitchen",
    "Dark stained wood shutters on a kitchen window and a pair of glass doors, beside espresso cabinets and pendant lights.",
  ),
  compositeShuttersDining: alta(
    "composite-shutters-dining-room",
    "Cream plantation shutters across a long row of loft windows above a dark wood dining table.",
  ),
  bandedBedroom: alta(
    "banded-shades-bedroom",
    "Light banded shades on three windows of a calm bedroom with wood floors and a low wood bed.",
  ),
  sheerShadingsDiningRoom: alta(
    "sheer-shadings-dining-room",
    "White sheer shadings on two tall windows softening the daylight over a farmhouse dining table.",
  ),
  rollerKitchenMotorized: alta(
    "roller-shades-kitchen-motorized",
    "A wide charcoal roller shade lowered over a kitchen window above a white farmhouse sink and black tile wall.",
  ),
  rollerBreakfastNook: alta(
    "roller-shades-breakfast-nook",
    "A light grey roller shade half lowered on a breakfast-nook window with a round dining table and a city view.",
  ),
  shuttersFrenchDoors: alta(
    "shutters-french-doors",
    "White shutters on a pair of French doors in a warm living room with clerestory windows and a stone wall.",
  ),
  woodBlindsKitchen: alta(
    "wood-blinds-kitchen-motorized",
    "White wood blinds on the windows and French doors of an open kitchen with a butcher-block island.",
  ),
  honeycombTopDown: alta(
    "honeycomb-shades-top-down",
    "White top-down bottom-up honeycomb shades lowered from the top of two windows in a green living room, leaving the sky in view.",
  ),
  sheerShadingsLivingRoom: alta(
    "sheer-shadings-living-room",
    "White sheer shadings across a corner wall of windows in a bright living room with rattan chairs and a driftwood table.",
  ),
  wovenBedroom: alta(
    "woven-shades-bedroom",
    "Natural woven shades on a wall of windows in a bright bedroom, with two armchairs looking out at the water.",
  ),
  honeycombSkylights: alta(
    "honeycomb-skylights-motorized",
    "Grey honeycomb shades on two angled skylights and a window in an attic bedroom.",
  ),
  rollerSunroom: alta(
    "roller-shades-sunroom",
    "Light-filtering roller shades on the windows and French doors of a sunroom with turquoise shiplap walls.",
  ),
  fauxWoodBath: alta(
    "faux-wood-blinds-bath",
    "Dark faux wood blinds on two windows of a blue-grey bathroom with a soaking tub and a sliding barn door.",
  ),
  verticalDiningRoom: alta(
    "vertical-blinds-dining-room",
    "Cream vertical blinds across two walls of tall windows in a modern dining room with navy chairs.",
  ),
  fauxWoodLivingRoom: alta(
    "faux-wood-blinds-living-room",
    "White faux wood blinds on three windows of a blue-grey living room with a white shiplap fireplace.",
  ),
  woodBlindsCornice: alta(
    "wood-blinds-cornice",
    "White wood blinds under matching cornices on a corner of windows in a living room with a white brick fireplace.",
  ),
  shuttersKitchen: alta(
    "shutters-kitchen",
    "White plantation shutters with open louvers on three kitchen windows over dark wood cabinets.",
  ),
  rollerKitchenBay: alta(
    "roller-shades-cassette",
    "Taupe roller shades lowered halfway on a bay of kitchen windows behind a white island with bar stools.",
  ),
  wovenLivingRoom: alta(
    "woven-shades-living-room",
    "Natural woven shades on a long wall of windows with transoms in a light blue living room.",
  ),
  rollerKidsRoom: alta(
    "roller-shades-bedroom",
    "White roller shades on the windows of a pink child's bedroom with a window seat.",
  ),
} satisfies Record<string, Photo>;

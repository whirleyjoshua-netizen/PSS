/**
 * The full product taxonomy.
 *
 * Five category hubs, sixteen child products, twenty-one pages — all rendered
 * through two templates. Adding a product, or adding the drapery category when
 * the Alta account is live, is an edit to this file and nothing else.
 *
 * Copy is written for the Las Vegas valley specifically: west-facing glass,
 * summer heat load, UV fade, and dust are the problems customers actually
 * search for. Generic manufacturer boilerplate does not rank and does not sell.
 */

export const CATEGORY_SLUGS = [
  "blinds",
  "shades",
  "shutters",
  "outdoor",
  "motorization",
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export type Seo = {
  title: string;
  description: string;
};

/** One of our own job photos. Alt text describes the treatment and the room. */
export type Photo = { src: string; alt: string };

/** The line icons the icon row can draw (components/ui/LineIcon.tsx). */
export type HighlightIcon =
  | "sun" | "eye" | "droplet" | "window" | "leaf" | "home" | "ruler"
  | "shield" | "thermometer" | "sofa" | "phone" | "clock" | "battery" | "arrow-up";

/** One entry in a category's icon row: a two-or-three-word label the page copy already backs up. */
export type Highlight = { label: string; icon: HighlightIcon };

/** The story section's wording on a category page (spec 2026-10-01 §5). */
export type CategoryStory = {
  eyebrow: string;
  heading: string;
  caption: { eyebrow: string; line: string };
};

export type Category = {
  slug: CategorySlug;
  name: string;
  navLabel: string;
  tagline: string;
  intro: string[];
  /** A photo of our own install, shown beside the intro. */
  image?: Photo;
  /**
   * A different photo of this category, shown in the booking block under the
   * hero so the page never repeats `image`. Unset means the consultation photo.
   */
  bookingPhoto?: Photo;
  /** Exactly four; product pages reuse their category's row. */
  highlights: Highlight[];
  story: CategoryStory;
  seo: Seo;
};

export type Product = {
  slug: string;
  name: string;
  category: CategorySlug;
  tagline: string;
  body: string[];
  features: string[];
  bestFor: string;
  /**
   * A photo of our own install that truly shows this product (spec §8). Leave it
   * unset rather than borrow a photo of something similar; the booking block
   * then shows the consultation photo.
   */
  image?: Photo;
  /**
   * A second, different photo of this same product for the story section, so the
   * page never repeats `image`. Unset means the story shows the fabric panel.
   */
  storyPhoto?: Photo;
  seo: Seo;
};

export const categories: Category[] = [
  {
    slug: "blinds",
    name: "Blinds",
    navLabel: "Blinds",
    tagline: "Precise control, slat by slat.",
    intro: [
      "Blinds give you something no other treatment does: the ability to keep the light and lose the glare. Tilt the slats and an afternoon that was unusable becomes comfortable, without closing the room off or giving up the view.",
      "They are also the most practical choice for the rooms that take the hardest use — kitchens, bathrooms, garages, and home offices — because they wipe clean, tolerate humidity, and cost less to cover a lot of glass than most alternatives.",
    ],
    image: {
      src: "/gallery/faux-wood-blinds-living-room.webp",
      alt: "White faux wood blinds with wide slats on two windows above a grey sofa with patterned pillows.",
    },
    bookingPhoto: {
      src: "/gallery/sheer-vertical-patio-slider.webp",
      alt: "Floor-to-ceiling sheer vertical blinds drawn across a patio slider in a living room, with the backyard visible through the fabric vanes.",
    },
    highlights: [
      { label: "Glare control", icon: "sun" },
      { label: "Privacy", icon: "eye" },
      { label: "Wipe clean", icon: "droplet" },
      { label: "Wide glass", icon: "window" },
    ],
    story: {
      eyebrow: "Keep the light, lose the glare",
      heading: "Control Without Closing the Room Off",
      caption: { eyebrow: "Made for hard-working rooms", line: "Kitchens, baths and home offices." },
    },
    seo: {
      title: "Blinds in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Custom vertical, wood, and faux wood blinds for Las Vegas homes. Free in-home consultation, measured and installed by the owners.",
    },
  },
  {
    slug: "shades",
    name: "Shades",
    navLabel: "Shades",
    tagline: "Soft light, or none at all.",
    intro: [
      "Shades are a single panel of fabric rather than a stack of slats, so they read as part of the room instead of hardware bolted to a window. That makes them the most versatile category we carry — the same window can get a sheer that glows all afternoon or a blackout that reads as midnight at two in the afternoon.",
      "In this valley the fabric choice matters more than anywhere else. Openness factor, screen weave, and liner determine whether a west-facing room stays livable in July, and it is the part homeowners most often get wrong when they buy online.",
    ],
    image: {
      src: "/gallery/cellular-shades-cabin-dining-room.webp",
      alt: "White cellular shades on the tall windows of a wood-paneled great room, above a dining table set with candles",
    },
    bookingPhoto: {
      src: "/gallery/roller-shades-bay-closeup.webp",
      alt: "Close view of light grey roller shades in a white-trimmed bay window, one raised to show trees below, with clear transom windows above.",
    },
    highlights: [
      { label: "Light control", icon: "sun" },
      { label: "Privacy", icon: "eye" },
      { label: "Energy savings", icon: "leaf" },
      { label: "Desert-ready fabrics", icon: "home" },
    ],
    story: {
      eyebrow: "More than a window covering",
      heading: "A Single Panel That Changes the Room",
      caption: { eyebrow: "Chosen for this valley", line: "The right fabric for every exposure." },
    },
    seo: {
      title: "Window Shades in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Roller, solar, cellular, roman, woven wood, and transitional shades for Las Vegas homes. Free in-home consultation and expert fabric guidance.",
    },
  },
  {
    slug: "shutters",
    name: "Shutters",
    navLabel: "Shutters",
    tagline: "Built in, not hung up.",
    intro: [
      "Shutters are the only window treatment that reads as architecture. They are fitted to the opening, framed, and finished, so they look like part of the house rather than something added to it — which is why they are the one treatment that reliably shows up in appraisals and listing photos.",
      "They are also the most durable thing we install. A well-built shutter outlasts the paint on the wall around it, holds up to sun that destroys fabric, and never needs a cord replaced.",
    ],
    image: {
      src: "/gallery/plantation-shutters-kitchen-sink.webp",
      alt: "White plantation shutters with open louvers over a farmhouse kitchen sink and marble countertop",
    },
    bookingPhoto: {
      src: "/gallery/plantation-shutters-primary-bath-pendant.webp",
      alt: "White plantation shutters with louvers tilted open on a wide primary-bathroom window, beside a round wire pendant light above the tub.",
    },
    highlights: [
      { label: "Built to fit", icon: "ruler" },
      { label: "Sun-proof", icon: "sun" },
      { label: "No cords", icon: "shield" },
      { label: "Adds value", icon: "home" },
    ],
    story: {
      eyebrow: "Part of the house",
      heading: "The Treatment That Reads as Architecture",
      caption: { eyebrow: "Fitted to the opening", line: "Framed, finished and built to last." },
    },
    seo: {
      title: "Plantation Shutters in Las Vegas, NV | Premier Shade",
      description:
        "Custom composite and real wood plantation shutters for Las Vegas homes. Built to the opening, installed by the owners. Free consultation.",
    },
  },
  {
    slug: "outdoor",
    name: "Outdoor Shading",
    navLabel: "Outdoor",
    tagline: "Stop the heat at the glass.",
    intro: [
      "In Las Vegas, the hardest-working windows are the ones facing west. Exterior shading stops the sun before it reaches the glass, which is the only way to meaningfully cut the heat load on a west-facing room — an interior shade absorbs that energy after it is already inside.",
      "Solar screens do that work for a whole side of the house at once: mounted over the window, they turn away most of the afternoon sun and take a real bite out of a summer power bill.",
    ],
    highlights: [
      { label: "Heat blocking", icon: "thermometer" },
      { label: "Whole walls", icon: "window" },
      { label: "Energy savings", icon: "leaf" },
      { label: "UV protection", icon: "shield" },
    ],
    story: {
      eyebrow: "Shade before the glass",
      heading: "Stop the Sun Before It Gets In",
      caption: { eyebrow: "West and south walls", line: "Up to 90% of the sun's heat turned away." },
    },
    seo: {
      title: "Exterior Solar Screens in Las Vegas, NV | Premier Shade",
      description:
        "Exterior solar screens for Las Vegas homes. Stop heat and glare before they reach the glass and cut cooling costs. Free in-home consultation.",
    },
  },
  {
    slug: "motorization",
    name: "Motorization",
    navLabel: "Motorization",
    tagline: "Every shade, on schedule.",
    intro: [
      "Motorization stopped being a luxury the moment it stopped requiring an electrician. Modern shades run on a rechargeable battery tube, pair to an app or a wall remote, and install in the same visit as a manual shade.",
      "It earns its keep in three places: windows nobody can reach, whole rooms that should move together, and schedules that beat the sun to the window — a shade that closes at 2pm every summer afternoon protects your floors and your thermostat whether or not anyone is home.",
    ],
    bookingPhoto: {
      src: "/gallery/cellular-shades-great-room-motorized.webp",
      alt: "White cellular shades lowered partway across a wall of tall windows in a wood-paneled great room, with armchairs and a holiday-set dining table in front.",
    },
    highlights: [
      { label: "App & remote", icon: "phone" },
      { label: "Schedules", icon: "clock" },
      { label: "No wiring", icon: "battery" },
      { label: "High windows", icon: "arrow-up" },
    ],
    story: {
      eyebrow: "No electrician required",
      heading: "Shades That Beat the Sun to the Window",
      caption: { eyebrow: "On schedule", line: "Closes itself every summer afternoon." },
    },
    seo: {
      title: "Motorized Shades in Las Vegas, NV | Premier Shade",
      description:
        "Motorized and app-controlled blinds and shades for Las Vegas homes. Scheduled sun protection, no wiring required. Free consultation.",
    },
  },
];

export const products: Product[] = [
  // ---------------------------------------------------------------- blinds
  {
    slug: "vertical-blinds",
    name: "Vertical Blinds",
    category: "blinds",
    tagline: "Built for the wide ones.",
    body: [
      "Sliding glass doors and tall patio windows are the hardest openings in most Las Vegas homes, and verticals remain the most sensible answer. The vanes stack to one side so the door still works as a door, and they tilt to kill the low western sun that a horizontal blind cannot reach.",
      "Today's vertical is not the brittle plastic one you remember from a nineties apartment. Fabric-wrapped vanes, faux wood, and PVC in warm neutrals hang straight, move quietly, and look considered rather than budget.",
      "Because the vanes hang rather than stack, they also shed dust instead of collecting it on every slat — a meaningful maintenance difference on a very large opening.",
    ],
    features: [
      "Designed for sliding doors and wide expanses of glass",
      "Vanes stack left, right, or split to a center opening",
      "Fabric, faux wood, and PVC vanes in warm neutral finishes",
      "Individual vanes replace easily if one is damaged",
      "Collects far less dust than a horizontal blind of the same size",
    ],
    bestFor: "Sliding glass doors, patio doors, and windows wider than they are tall.",
    image: {
      src: "/gallery/vertical-blinds-patio-door-valance.webp",
      alt: "White vertical blinds drawn across a sliding patio door beneath a grey floral swag valance, with a sunroom visible through the glass.",
    },
    storyPhoto: {
      src: "/gallery/sheer-vertical-patio-slider.webp",
      alt: "Floor-to-ceiling sheer vertical blinds drawn across a patio slider in a living room, with the backyard visible through the fabric vanes.",
    },
    seo: {
      title: "Vertical Blinds in Las Vegas, NV | Premier Shade",
      description:
        "Custom vertical blinds for Las Vegas sliding doors and wide windows. Modern fabric and faux wood vanes. Free in-home consultation.",
    },
  },
  {
    slug: "wood-blinds",
    name: "Wood & Faux Wood Blinds",
    category: "blinds",
    tagline: "Warmth with a working tilt.",
    body: [
      "Wood blinds bring the warmth of a shutter at a fraction of the cost, with the slat control a shutter also gives you. Real basswood is light, takes stain beautifully, and suits a room where the trim and the floor are already doing the talking.",
      "Faux wood is the more practical sibling and, in this climate, usually the smarter buy. It will not warp, fade, or crack in direct desert sun, and it goes anywhere moisture lives. Modern faux wood is embossed and color-matched well enough that most people cannot tell the difference from across the room.",
      "The honest guidance we give: use real wood where the window is shaded and the room is formal, and faux wood everywhere the sun actually hits. We have replaced too many sun-bleached real wood blinds on west elevations to recommend otherwise.",
    ],
    features: [
      "Real basswood in stains and paints, or faux wood in matched finishes",
      "2 inch and 2 1/2 inch slats for a substantial, architectural look",
      "Faux wood resists warping, fading, and cracking in direct sun",
      "Optional decorative valances and cloth tapes",
      "Cordless lift available for homes with children or pets",
    ],
    bestFor: "Living rooms, dining rooms, and bedrooms wanting warmth without shutter cost.",
    image: {
      src: "/gallery/faux-wood-blinds-front-window.webp",
      alt: "White faux wood blinds with wide slats and cloth tapes in a tall front window, framed by cream curtains, looking out to a covered porch and the street.",
    },
    storyPhoto: {
      src: "/gallery/faux-wood-blinds-living-room.webp",
      alt: "White faux wood blinds with wide slats on two windows above a grey sofa with patterned pillows.",
    },
    seo: {
      title: "Wood & Faux Wood Blinds in Las Vegas, NV",
      description:
        "Custom wood and faux wood blinds for Las Vegas homes. Faux wood resists desert sun and warping. Free in-home consultation and install.",
    },
  },

  // ---------------------------------------------------------------- shades
  {
    slug: "roller-shades",
    name: "Roller Shades",
    category: "shades",
    tagline: "One clean line of fabric.",
    body: [
      "A roller shade is the simplest thing we install and, increasingly, the most requested. A single panel of fabric rolls onto a tube hidden in a slim cassette, so when it is up the window is genuinely uncovered and when it is down you see fabric, not hardware.",
      "Because the fabric does all the work, the choice of fabric is the entire decision. The same shade can be a sheer that keeps a room bright while cutting glare, a room-darkening weave for a media room, or a true blackout for a bedroom where someone works nights.",
      "Dual roller systems put two fabrics on one bracket — a solar screen for daytime and a blackout behind it — which is the setup we specify most often for west-facing bedrooms in this valley.",
    ],
    features: [
      "Sheer, light filtering, room darkening, and true blackout fabrics",
      "Slim cassette or fascia conceals the roll completely",
      "Dual roller option pairs a day screen with a night blackout",
      "Side channels available to eliminate light gaps in bedrooms",
      "Cordless, chain, or motorized operation",
    ],
    bestFor: "Bedrooms, media rooms, and any room wanting a clean modern line.",
    image: {
      src: "/gallery/roller-shades-dining-room.webp",
      alt: "Light textured roller shades in slim cassettes, half raised on four windows around a dining table, with a green yard outside.",
    },
    storyPhoto: {
      src: "/gallery/roller-shades-transom-closeup.webp",
      alt: "Grey roller shades lowered in three bay windows beneath gridded transom windows, with white orchids in the foreground.",
    },
    seo: {
      title: "Roller Shades in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Custom roller shades for Las Vegas homes, from sheer to true blackout. Dual roller day-and-night systems available. Free consultation.",
    },
  },
  {
    slug: "solar-shades",
    name: "Solar Shades",
    category: "shades",
    tagline: "See out. Keep the heat out.",
    body: [
      "Solar shades are a technical screen fabric rather than a decorative one. The weave blocks a measured percentage of solar energy and UV while leaving the weave open enough to see through, so you keep the view and lose the glare and the heat that comes with it.",
      "The number that matters is openness factor. A three percent screen is tight — maximum heat and UV rejection, a softer view. A ten percent screen keeps a crisp view but lets more energy through. Choosing between them depends on which direction the window faces and what is outside it, and it is exactly the decision people get wrong buying online.",
      "For a valley where west-facing glass takes a beating from two in the afternoon until sunset, and where UV quietly bleaches hardwood, rugs, and leather, solar shades are the single most practical upgrade we sell. They also cut the glare that makes a television or a monitor unusable in the afternoon.",
    ],
    features: [
      "Openness factors from 1% to 14%, specified per window and exposure",
      "Blocks up to 99% of UV to protect flooring, furniture, and art",
      "Preserves the outside view during daylight hours",
      "Cuts screen glare on televisions and monitors",
      "Reduces cooling load on west and south elevations",
    ],
    bestFor: "West and south-facing living rooms, home offices, and rooms with a view worth keeping.",
    image: {
      src: "/gallery/solar-shades-balcony-view.webp",
      alt: "Two white solar screen shades lowered over balcony doors in a high-rise, with the city still visible through the weave.",
    },
    storyPhoto: {
      src: "/gallery/solar-shades-nursery.webp",
      alt: "Light grey solar roller shades in white cassettes on tall corner windows of a nursery, lowered partway over a sunlit street, beside a rocking chair.",
    },
    seo: {
      title: "Solar Shades in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Custom solar screen shades for Las Vegas homes. Block up to 99% of UV and cut heat and glare while keeping your view. Free consultation.",
    },
  },
  {
    slug: "cellular-shades",
    name: "Cellular Shades",
    category: "shades",
    tagline: "The insulating one.",
    body: [
      "Cellular shades, sometimes called honeycomb, are built from pleated cells that trap a layer of still air against the glass. That trapped air is genuine insulation, and it is the reason this is the highest-performing energy product in the category.",
      "In a Las Vegas summer that insulation works in the direction people forget: it slows heat coming in, not just heat leaking out. On a single-pane window or an older aluminum frame, a double-cell shade makes a measurable difference in how hard the air conditioning has to work in the afternoon.",
      "They also stack remarkably small. A cellular shade raised to the top of a tall window takes up a fraction of the space a comparable roman or roller would, which keeps the glass usable. Top-down bottom-up operation lets you drop the top for daylight while keeping the lower half private — the setup we specify constantly for front-facing bedrooms and street-side bathrooms.",
    ],
    features: [
      "Single, double, and triple cell constructions for increasing insulation",
      "Measurably reduces summer heat gain and winter heat loss",
      "Top-down bottom-up operation for privacy with daylight",
      "Compact stack keeps tall windows usable",
      "Light filtering and blackout cell fabrics",
    ],
    bestFor: "Bedrooms, older windows, and any home where the summer power bill is a concern.",
    image: {
      src: "/gallery/cellular-shades-great-room.webp",
      alt: "White cellular shades lowered across two rows of windows in a vaulted great room with exposed wood beams and a stone fireplace.",
    },
    storyPhoto: {
      src: "/gallery/cellular-shades-top-down-bedroom.webp",
      alt: "Top-down bottom-up cellular shades covering the lower half of two wood-trimmed windows in a bedroom, with sky visible above.",
    },
    seo: {
      title: "Cellular Shades in Las Vegas, NV | Premier Shade",
      description:
        "Insulating cellular honeycomb shades for Las Vegas homes. Cut summer heat gain and cooling costs. Top-down bottom-up options available.",
    },
  },
  {
    slug: "roman-shades",
    name: "Roman Shades",
    category: "shades",
    tagline: "Soft folds, tailored.",
    body: [
      "Roman shades fold into horizontal pleats as they rise, giving you the softness of drapery in the footprint of a shade. They are the most tailored-looking thing in the category and the choice people make when the window treatment is meant to be part of the room's design rather than a utility.",
      "Style comes down to the fold. A flat roman reads crisp and contemporary. A hobbled roman holds soft cascading loops even when fully lowered, which suits a more traditional room. Both can be lined for privacy or interlined for genuine room darkening.",
      "They are the right call in formal living rooms, dining rooms, and primary bedrooms — anywhere the fabric itself is meant to be seen. They are the wrong call above a kitchen sink, where fabric and cooking grease eventually meet.",
    ],
    features: [
      "Flat fold for contemporary rooms, hobbled fold for traditional",
      "Extensive designer fabric selection including linens and textured weaves",
      "Optional privacy or blackout lining",
      "Cordless lift available for child and pet safety",
      "Coordinating valances and pillows available from the same fabric",
    ],
    bestFor: "Formal living and dining rooms, primary bedrooms, and design-forward spaces.",
    image: {
      src: "/gallery/roman-shades-woven-dining-room.webp",
      alt: "Three grey woven roman shades raised partway on a row of dining room windows, with a table and chairs below and a green lawn outside.",
    },
    storyPhoto: {
      src: "/gallery/roman-shades-primary-bath.webp",
      alt: "White hobbled roman shades in soft folds on two corner windows above a freestanding tub in a primary bathroom.",
    },
    seo: {
      title: "Roman Shades in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Custom flat and hobbled roman shades for Las Vegas homes. Designer fabrics with optional blackout lining. Free in-home consultation.",
    },
  },
  {
    slug: "woven-wood-shades",
    name: "Woven Wood Shades",
    category: "shades",
    tagline: "Texture that filters the light.",
    body: [
      "Woven woods are made from natural bamboo, reed, jute, and grasses, which means no two shades are identical and every one brings visible texture into the room. When light passes through the weave it picks up warmth and casts a dappled pattern that no manufactured fabric reproduces.",
      "They have become the default choice in the organic-modern and desert-contemporary interiors that suit this valley, sitting comfortably next to plaster, warm wood, and terracotta without looking themed.",
      "One practical caution we always give: the natural weave is open by design, so a woven wood alone is not a privacy treatment. In a bedroom or a street-facing room we add a privacy or blackout liner behind it, which preserves the texture from inside while closing the weave.",
    ],
    features: [
      "Natural bamboo, reed, jute, and grass weaves",
      "Every shade is unique — natural material, natural variation",
      "Optional privacy or blackout liner for bedrooms",
      "Warm dappled light no synthetic fabric reproduces",
      "Coordinating edge banding and valances",
    ],
    bestFor: "Living rooms, sunrooms, and organic-modern or desert-contemporary interiors.",
    // Tall and soft: it reads well at its own shape in the story, not stretched across the hero.
    storyPhoto: {
      src: "/gallery/woven-wood-shades-hall-window.webp",
      alt: "A natural woven wood shade lowered over a tall window at the end of a hallway, daylight glowing through the grass weave.",
    },
    seo: {
      title: "Woven Wood Shades in Las Vegas, NV | Premier Shade",
      description:
        "Natural bamboo and woven wood shades for Las Vegas homes. Warm texture with optional privacy liners. Free in-home consultation.",
    },
  },
  {
    slug: "transitional-shades",
    name: "Transitional Shades",
    category: "shades",
    tagline: "Sheer and solid, in one shade.",
    body: [
      "Transitional shades — also sold as zebra or dual-layer shades — alternate sheer and opaque horizontal bands on a single rolling panel. Align the opaque bands and the shade is closed. Offset them and the sheers line up and the room fills with filtered light. You get two treatments from one shade and one bracket.",
      "That range is the appeal. A single shade takes a room from open and bright at breakfast to private and glare-free by mid-afternoon, without swapping anything or layering two products on one window.",
      "They read distinctly contemporary, with clean horizontal banding that suits newer construction. In older or more traditional homes we usually point people toward a roller or a cellular instead.",
    ],
    features: [
      "Alternating sheer and opaque bands on one rolling panel",
      "Adjusts from filtered daylight to full privacy in one motion",
      "Replaces the need to layer two separate treatments",
      "Cassette headrail conceals the roll",
      "Motorization available",
    ],
    bestFor: "Contemporary homes, newer construction, and rooms needing both daylight and privacy.",
    image: {
      src: "/gallery/transitional-shades-slider-wall.webp",
      alt: "Charcoal transitional sheer shades raised across a four-panel glass slider wall in a living room, with a river and balcony seating visible beyond.",
    },
    seo: {
      title: "Transitional Zebra Shades in Las Vegas, NV",
      description:
        "Dual-layer transitional zebra shades for Las Vegas homes. Sheer and privacy in a single shade. Free in-home consultation and install.",
    },
  },

  // -------------------------------------------------------------- shutters
  {
    slug: "plantation-shutters",
    name: "Plantation Shutters",
    category: "shutters",
    tagline: "The one that becomes part of the house.",
    body: [
      "Plantation shutters are wide-louver interior shutters fitted into the window opening and framed to the wall. Because they are built to the opening rather than hung in front of it, they read as architecture — and they are the one window treatment that reliably adds value at resale rather than depreciating.",
      "The louver size sets the character. Three-and-a-half inch louvers suit smaller windows and traditional rooms. Four-and-a-half inch louvers give a cleaner sightline and more view when open, which is what most Las Vegas homes with large modern glass should be using.",
      "They also solve problems fabric cannot. Louvers tilt to redirect low afternoon sun up toward the ceiling instead of into your eyes, they never fade or fray, and they add a real layer of insulation at the glass. On a hard west elevation, a shutter will still look right in fifteen years when a fabric shade would have been replaced twice.",
    ],
    features: [
      "3 1/2 inch and 4 1/2 inch louvers to suit the window and the room",
      "Built to the opening and framed — reads as architecture, not hardware",
      "Hidden tilt rod option for a clean, uninterrupted louver face",
      "Adds insulation at the glass and never fades or frays",
      "The window treatment most likely to return value at resale",
    ],
    bestFor: "Front-facing rooms, primary living spaces, and homes being held long term.",
    image: {
      src: "/gallery/plantation-shutters-dining-room.webp",
      alt: "White plantation shutters on three windows in a dining room with blue walls and industrial pendant lights over the table.",
    },
    storyPhoto: {
      src: "/gallery/plantation-shutters-bedroom.webp",
      alt: "White plantation shutters with open louvers on two windows in a bedroom with grey walls.",
    },
    seo: {
      title: "Plantation Shutters in Las Vegas, NV | Premier Shade",
      description:
        "Custom plantation shutters for Las Vegas homes. Built to the opening, framed, and installed by the owners. Free in-home consultation.",
    },
  },
  {
    slug: "composite-shutters",
    name: "Composite Shutters",
    category: "shutters",
    tagline: "Engineered for this climate.",
    body: [
      "Composite shutters use an engineered wood or polymer core wrapped in a durable finish. They deliver the look of a painted wood shutter while removing the two things that kill wood in the desert: sun and moisture.",
      "A composite louver will not warp on a west-facing window, will not yellow, and will not swell in a bathroom. That makes it our default recommendation for the majority of Las Vegas homes, and the reason we specify it far more often than real wood.",
      "They are also heavier than wood, which is a genuine constraint on very wide openings — beyond a certain panel width the weight demands additional stiles that interrupt the view. We work that out at the measurement, not after the order.",
    ],
    features: [
      "Will not warp, crack, or yellow in direct desert sun",
      "Safe for bathrooms, laundry rooms, and kitchens",
      "Consistent factory paint finish that resists chipping",
      "Generally more affordable than comparable real wood",
      "Backed by strong manufacturer warranties",
    ],
    bestFor: "Most Las Vegas homes, and any window on a west or south elevation.",
    image: {
      src: "/gallery/plantation-shutters-french-doors.webp",
      alt: "White plantation shutters mounted on a pair of French doors and on the tall window beside them.",
    },
    storyPhoto: {
      src: "/gallery/plantation-shutters-bedroom.webp",
      alt: "White plantation shutters with open louvers on two windows in a bedroom with grey walls.",
    },
    seo: {
      title: "Composite Shutters in Las Vegas, NV | Premier Shade",
      description:
        "Durable composite plantation shutters built for the Las Vegas climate. Will not warp, fade, or yellow in desert sun. Free consultation.",
    },
  },
  {
    slug: "wood-shutters",
    name: "Real Wood Shutters",
    category: "shutters",
    tagline: "Lighter panels, real grain.",
    body: [
      "Real wood shutters are milled from hardwood, usually basswood, and finished in stain or paint. Wood is significantly lighter than composite, which means wider panels are possible before extra stiles are needed — so on a large opening a wood shutter can give a cleaner, more open sightline.",
      "Wood is also the only option if you want visible grain. A stained wood shutter next to wood floors or exposed beams does something no painted composite can imitate.",
      "The trade-off is honest and worth stating plainly: wood moves. In sustained direct sun it can fade, and in a humid room it can swell. We specify it for shaded elevations, interior openings, and formal rooms — and steer people to composite for the west-facing glass.",
    ],
    features: [
      "Milled hardwood with visible natural grain",
      "Lighter weight allows wider panels and cleaner sightlines",
      "Extensive stain and paint finishes to match existing woodwork",
      "The premium choice for formal and traditional interiors",
      "Best suited to shaded elevations and dry interior rooms",
    ],
    bestFor: "Shaded windows, formal rooms, and homes with wood floors or beams to match.",
    image: {
      src: "/gallery/plantation-shutters-bath.webp",
      alt: "White plantation shutters with wide louvers on a primary bathroom window above a soaking tub.",
    },
    storyPhoto: {
      src: "/gallery/plantation-shutters-kitchen-sink.webp",
      alt: "White plantation shutters with open louvers over a farmhouse kitchen sink and marble countertop",
    },
    seo: {
      title: "Real Wood Shutters in Las Vegas, NV | Premier Shade",
      description:
        "Custom hardwood plantation shutters for Las Vegas homes. Real grain, wider panels, stain-matched to your woodwork. Free consultation.",
    },
  },

  // --------------------------------------------------------------- outdoor
  {
    slug: "solar-screens",
    name: "Solar Screens",
    category: "outdoor",
    tagline: "Fixed protection, every window.",
    body: [
      "Solar screens are fixed exterior screens mounted over the window itself. Unlike a retractable shade, they stay in place through the season and quietly reject a large share of solar energy before it reaches the glass — commonly seventy to ninety percent depending on the mesh.",
      "They are the most cost-effective exterior product per window, which is why they are the practical choice when the goal is to treat an entire west elevation rather than a single opening. Homeowners commonly see a real reduction in a summer power bill after screening the west side of a house.",
      "The honest trade-off is that they darken the view from inside and are visible from the street, so they suit the elevation that takes the beating rather than the front of the house. We usually specify screens on the west and south and something else on the front.",
    ],
    features: [
      "Rejects roughly 70–90% of solar heat before it reaches the glass",
      "Fixed installation, seasonal or year-round",
      "The most economical way to treat an entire elevation",
      "Reduces UV fading on flooring and furniture",
      "Also functions as an insect screen",
    ],
    bestFor: "Entire west and south elevations where cooling cost is the priority.",
    seo: {
      title: "Solar Screens in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Exterior solar screens for Las Vegas homes. Reject up to 90% of solar heat and cut cooling costs. Free in-home consultation.",
    },
  },
];

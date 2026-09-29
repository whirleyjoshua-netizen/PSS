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

export type Category = {
  slug: CategorySlug;
  name: string;
  navLabel: string;
  tagline: string;
  intro: string[];
  /** A photo of our own install, shown beside the intro. */
  image?: { src: string; alt: string };
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
    seo: {
      title: "Blinds in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Custom aluminum, vertical, wood, and faux wood blinds for Las Vegas homes. Free in-home consultation, measured and installed by the owners.",
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
    tagline: "Take back the patio.",
    intro: [
      "In Las Vegas the difference between a patio you use and a patio you look at is shade. Exterior shading stops the sun before it reaches the glass, which is the only way to meaningfully cut the heat load on a west-facing room — an interior shade absorbs that energy after it is already inside.",
      "Measured properly, exterior products routinely drop a covered patio by fifteen to twenty degrees and take a real bite out of a summer power bill.",
    ],
    seo: {
      title: "Patio Shades & Solar Screens in Las Vegas, NV",
      description:
        "Exterior patio roller shades, rolling shutters, and solar screens for Las Vegas homes. Cut heat and glare before it reaches the glass.",
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
    slug: "aluminum-blinds",
    name: "Aluminum Blinds",
    category: "blinds",
    tagline: "The practical workhorse.",
    body: [
      "Aluminum blinds are the most cost-effective way to get real light control on a lot of windows at once, which is why they show up in rentals, home offices, and secondary bedrooms more than anything else we sell. Slats tilt to cut glare without going dark, and the whole blind raises out of the way when you want the window back.",
      "They handle heat and humidity without warping, which matters in a bathroom or a laundry room where a wood product would eventually swell. They also wipe down in seconds, which is not a small thing in a valley where dust is a permanent condition.",
      "The trade-off is acoustic and visual: aluminum slats are thinner and lighter than wood, so they can rattle in a draft and they read as more utilitarian. In rooms where the window treatment is part of the design, we usually steer people elsewhere.",
    ],
    features: [
      "Slat widths from 1/2 inch for small openings to 2 inch for large glass",
      "Tilt for glare control without losing the view",
      "Moisture-safe for kitchens, baths, and laundry rooms",
      "Wide color range including matte, metallic, and wood-look finishes",
      "The most economical option for covering many windows at once",
    ],
    bestFor: "Kitchens, bathrooms, laundry rooms, home offices, and rental properties.",
    seo: {
      title: "Aluminum Blinds in Las Vegas, NV | Premier Shade",
      description:
        "Durable, affordable custom aluminum blinds for Las Vegas homes. Moisture-safe and easy to clean. Free in-home consultation and measurement.",
    },
  },
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
    seo: {
      title: "Wood & Faux Wood Blinds in Las Vegas, NV",
      description:
        "Custom wood and faux wood blinds for Las Vegas homes. Faux wood resists desert sun and warping. Free in-home consultation and install.",
    },
  },
  {
    slug: "mini-blinds",
    name: "Mini Blinds",
    category: "blinds",
    tagline: "Small openings, clean lines.",
    body: [
      "Mini blinds use a narrow one-inch slat, which lets them fit inside shallow window frames, door lights, and small openings where a two-inch slat simply will not mount. They are the quiet solution to the windows that other treatments cannot cover.",
      "The narrow slat also stacks tighter at the top, so more of a small window stays visible when the blind is raised — a real advantage on a bathroom or stairwell window where every inch of glass counts.",
      "We most often specify them for door sidelights, garage windows, RV and casita openings, and the awkward high windows builders like to put above a tub.",
    ],
    features: [
      "One inch slats fit shallow frames and small openings",
      "Compact stack keeps more glass visible when raised",
      "Aluminum or vinyl construction, both moisture tolerant",
      "Ideal for door sidelights and glass-panel doors",
      "Cordless options for safety near tubs and stairs",
    ],
    bestFor: "Door sidelights, small bathroom windows, garages, casitas, and stairwells.",
    seo: {
      title: "Mini Blinds in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Custom one-inch mini blinds for small and shallow Las Vegas window openings, door sidelights, and casitas. Free consultation.",
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
    seo: {
      title: "Real Wood Shutters in Las Vegas, NV | Premier Shade",
      description:
        "Custom hardwood plantation shutters for Las Vegas homes. Real grain, wider panels, stain-matched to your woodwork. Free consultation.",
    },
  },

  // --------------------------------------------------------------- outdoor
  {
    slug: "patio-shades",
    name: "Patio Roller Shades",
    category: "outdoor",
    tagline: "Fifteen degrees of difference.",
    body: [
      "Exterior patio roller shades drop a solar screen fabric across a patio opening, stopping the sun before it reaches the space. That sequence is the whole point: shading on the outside rejects heat, while an interior shade only absorbs it after it has already entered.",
      "A properly specified patio screen routinely drops a covered patio by fifteen to twenty degrees, cuts the wind-driven dust that makes outdoor furniture unusable, and turns a west-facing yard from a summer write-off into somewhere you can actually sit at six in the evening.",
      "They also protect the room behind them. A patio screen across a slider does more for the adjacent living room's cooling load than any interior treatment on the same glass.",
    ],
    features: [
      "Exterior solar screen fabric in openness factors from 1% to 10%",
      "Typically drops covered patio temperature 15–20°F",
      "Cuts wind-driven dust and blowing debris",
      "Manual crank, motorized, or wind-sensor automated",
      "Track and cable guide systems for windy exposures",
    ],
    bestFor: "West-facing patios, covered porches, and outdoor kitchens.",
    seo: {
      title: "Patio Roller Shades in Las Vegas, NV | Premier Shade",
      description:
        "Exterior patio roller shades for Las Vegas homes. Drop patio temperatures 15-20 degrees and block dust. Free in-home consultation.",
    },
  },
  {
    slug: "rolling-shutters",
    name: "Rolling Shutters",
    category: "outdoor",
    tagline: "Shade, security, and quiet.",
    body: [
      "Rolling shutters are interlocking aluminum slats that roll down from a housing above the opening and lock in place. They are the most substantial exterior product available, and the only one that does three jobs at once: total blackout, a real physical security barrier, and a meaningful reduction in outside noise.",
      "Closed, they eliminate solar gain on that opening entirely. That makes them a favorite for media rooms, for anyone who works nights and sleeps days, and for homes that sit empty part of the year — a closed rolling shutter is both a locked barrier and a signal that the glass behind it is not worth attempting.",
      "They can be operated by strap, crank, or motor, and integrated with a home automation system so a whole elevation closes on a schedule.",
    ],
    features: [
      "Interlocking aluminum slats with a locking bottom rail",
      "Complete blackout and total elimination of solar gain",
      "Genuine physical security barrier over glass",
      "Measurable reduction in exterior noise",
      "Manual or motorized, with automation integration available",
    ],
    bestFor: "Media rooms, night-shift sleepers, seasonal residences, and ground-floor security.",
    seo: {
      title: "Rolling Shutters in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Exterior rolling security shutters for Las Vegas homes. Total blackout, security, and noise reduction. Free in-home consultation.",
    },
  },
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

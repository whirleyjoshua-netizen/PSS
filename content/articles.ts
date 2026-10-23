import { WARRANTY } from "./warranty";

/**
 * Buying guides at /learn/<slug> (SEO plan 2026-10-21, from the 10-17 keyword research: the comparison page, the
 * blackout page and the brands page). Not repair guides: those are content/guides.ts.
 *
 * Approved by the owner 2026-10-22 with unconfirmed claims removed. Every product claim comes
 * from content/products.ts, content/faq.ts or content/warranty.ts. No prices, no "authorized dealer", no savings
 * figures (owner rulings 2026-10-17).
 */
export type ArticleSection = { heading: string; paragraphs: string[] };

export type Article = {
  slug: string;
  /** Short name for the breadcrumb and link lists. */
  crumb: string;
  /** The H1, phrased the way people search. */
  title: string;
  seo: { title: string; description: string };
  published: string;
  updated: string;
  quickAnswer: string;
  sections: ArticleSection[];
  /** Product pages this guide answers a question for; each links back here. */
  products: { name: string; href: string }[];
};

export const articles: Article[] = [
  {
    slug: "solar-screens-vs-solar-shades",
    crumb: "Solar screens vs. solar shades",
    title: "Solar screens vs. solar shades: which works better in Las Vegas heat?",
    seo: {
      title: "Solar Screens vs. Solar Shades | Premier Shade Solutions",
      description:
        "Solar screens go outside and stop the heat before the glass; solar shades go inside and keep the view. Which fits your Las Vegas windows, and when to use both.",
    },
    published: "2026-10-22",
    updated: "2026-10-22",
    quickAnswer:
      "If the goal is to cut heat on a west or south wall, a solar screen outside the glass does the most, turning away roughly 70–90% of the sun's heat before it reaches the window. If the goal is glare, UV and keeping your view from inside, a solar shade does it better. Many Las Vegas homes use screens on the hot sides and shades on the windows people look out of.",
    sections: [
      {
        heading: "Outside the glass or inside it",
        paragraphs: [
          "The names sound alike, and they are both made of a woven screen fabric, but they sit on opposite sides of the window. A solar screen is a fixed exterior screen mounted over the outside of the window. A solar shade is an interior roller shade made from screen fabric, which you raise and lower like any other shade.",
          "That one difference decides almost everything else: how much heat each one stops, how the view looks, and whether your HOA has a say.",
        ],
      },
      {
        heading: "Heat: stop it before it reaches the glass",
        paragraphs: [
          "The sun's heat is easiest to deal with before it gets through the window. A solar screen catches it outside, rejecting roughly 70–90% of the solar heat depending on the mesh, which is why it is the most practical way to treat an entire west or south side of a house in this valley.",
          "A solar shade still cuts heat and takes real load off your air conditioning on west and south windows, but it works from inside, after the sun has come through the glass. For a room that is simply too hot every afternoon, the screen usually does more.",
        ],
      },
      {
        heading: "Glare, view and UV",
        paragraphs: [
          "This is where the solar shade wins. It blocks up to 99% of UV, which is what quietly bleaches hardwood, rugs and leather, and it cuts the glare that makes a television or a monitor unusable in the afternoon, while you still see out.",
          "The number that matters is the openness factor, from 1% to 14%. A tight 3% screen turns away more heat and UV with a softer view; a 10% screen keeps a crisp view and lets more light through. We choose it window by window, because the right answer depends on which way the window faces and what is outside it.",
        ],
      },
      {
        heading: "Looks, the street and your HOA",
        paragraphs: [
          "A solar screen darkens the view a little from inside and can be seen from the street, so we put them on the sides of the house that take the beating rather than the front. Because they are on the outside, we check your HOA's guidelines with you before ordering.",
          "A solar shade disappears into a slim cassette when it is up, and when it is down it looks like any other interior shade.",
        ],
      },
      {
        heading: "When we use both",
        paragraphs: [
          "On a hard west wall, the two work together: screens outside to stop the heat, and inside, a shade for the windows where you want control of the light. For west-facing bedrooms we often go further and put a solar screen fabric and a blackout on one dual roller, so the room has a view by day and real darkness at night.",
          "At your free consultation we bring both, hold them up to your own windows, and tell you honestly which ones need which.",
        ],
      },
    ],
    products: [
      { name: "Solar screens", href: "/outdoor/solar-screens" },
      { name: "Solar shades", href: "/shades/solar-shades" },
    ],
  },
  {
    slug: "blackout-shades-for-day-sleepers",
    crumb: "Blackout shades for day sleepers",
    title: "Blackout shades for day sleepers: a truly dark bedroom in Las Vegas",
    seo: {
      title: "Blackout Shades for Day Sleepers | Premier Shade Solutions",
      description:
        "Work nights in Las Vegas? How to get a truly dark bedroom in the middle of the day: blackout fabric, side channels, dual rollers and motorized schedules.",
    },
    published: "2026-10-22",
    updated: "2026-10-22",
    quickAnswer:
      "Choose a blackout roller shade with side channels. Blackout fabric stops light coming through the shade, and the channels close the light gaps at the edges, which is where an ordinary shade leaks. On a west-facing bedroom, a dual roller adds a solar screen in front for the hours you are awake.",
    sections: [
      {
        heading: "Why the room is still bright",
        paragraphs: [
          "Las Vegas runs around the clock, and a lot of the valley sleeps while the sun is up. Most bedrooms were never set up for it. Even a shade made from blackout fabric lets light in around its edges, and in a west-facing room the afternoon sun finds every gap.",
          "Getting a room truly dark is about two things: fabric that stops light completely, and nothing letting light around the sides.",
        ],
      },
      {
        heading: "Blackout fabric with side channels",
        paragraphs: [
          "A blackout roller shade is the most reliable answer. The fabric does the blocking, and side channels, tracks that run down both edges of the window, close the gaps where light would spill in. It is the setup we recommend for anyone who sleeps days.",
          "Cellular shades also come in blackout fabrics, and their trapped air adds insulation, which helps a hot west bedroom stay cooler while you sleep.",
        ],
      },
      {
        heading: "A dual roller for the hours you are awake",
        paragraphs: [
          "A bedroom that is dark for sleep still needs daylight the rest of the time. A dual roller puts two fabrics on one bracket: a solar screen in front that cuts heat and glare but keeps your view, and the blackout behind it. It is the setup we specify most for west-facing bedrooms in this valley.",
        ],
      },
      {
        heading: "Let a schedule do it",
        paragraphs: [
          "Motorized shades can close themselves at the same time every day, and open when your alarm goes off, so the room is dark before you get home from a shift. Alta's BLISS motors run from a free app or a remote, with timers by the clock or by your local sunrise and sunset, and they recharge with a USB-C cable, so there is no wiring.",
        ],
      },
      {
        heading: "Getting it right the first time",
        paragraphs: [
          "Blackout only works if the shade fits, which is why Josh measures every window himself, backed by our measurement guarantee: if a measurement is off, we remake it and install it again, free. Tell us at the consultation that someone in the house sleeps days, and we will plan every bedroom window around it.",
        ],
      },
    ],
    products: [
      { name: "Roller shades", href: "/shades/roller-shades" },
      { name: "Cellular shades", href: "/shades/cellular-shades" },
      { name: "Motorization", href: "/motorization" },
    ],
  },

  {
    slug: "hunter-douglas-alta-norman-las-vegas",
    crumb: "Hunter Douglas, Alta and Norman",
    title: "Hunter Douglas, Alta and Norman window treatments in Las Vegas",
    seo: {
      title: "Hunter Douglas, Alta & Norman | Premier Shade Solutions",
      description:
        "We carry Hunter Douglas, Alta and Norman blinds, shades and shutters in Las Vegas, measured and installed by our family. Compare makers at your window.",
    },
    published: "2026-10-22",
    updated: "2026-10-22",
    quickAnswer:
      "We carry Hunter Douglas, Alta and Norman, so at your free consultation we can show you more than one maker's answer for the same window, and tell you honestly which one fits. Whichever you choose, we measure it and install it ourselves.",
    sections: [
      {
        heading: "Why we carry more than one brand",
        paragraphs: [
          "Many window treatment companies sell one maker's line, so every window gets that maker's answer. We carry three, Hunter Douglas, Alta and Norman, which means we can put more than one option in front of your window and let you see the difference in your own light.",
          "Josh has spent more than twenty years in window treatments, installing, building, selling and repairing them. That is the experience behind telling you which product holds up on a west-facing window in this valley, and which one is the better value for a room that does not take the sun.",
        ],
      },
      {
        heading: "Motorization from Alta",
        paragraphs: [
          "For motorized shades we install Alta's BLISS Automation 2.0 on roller, woven wood, honeycomb, sheer, banded, wood and faux wood styles. Open and close every shade from the free BLISS app on iPhone or Android, or from a remote that runs up to 10 shades, and set timers by the clock or by your local sunrise and sunset. Each motor recharges overnight with a USB-C cable and runs up to 500 trips on a charge. Add the optional BLISS Bridge and your shades answer to Alexa, Google Home and Siri.",
        ],
      },
      {
        heading: "The warranty comes from the maker",
        paragraphs: [
          `${WARRANTY.product} ${WARRANTY.motor} ${WARRANTY.install} ${WARRANTY.fineprint}`,
        ],
      },
      {
        heading: "Measured and installed by us",
        paragraphs: [
          "Whichever brand you choose, the part that decides whether it works is the measurement and the install. Josh measures every window himself, backed by our measurement guarantee, and we install every order ourselves, never a subcontractor. On install day we walk through every window with you, clean up, and haul your old blinds away free.",
        ],
      },
    ],
    products: [
      { name: "Blinds", href: "/blinds" },
      { name: "Shades", href: "/shades" },
      { name: "Shutters", href: "/shutters" },
      { name: "Motorization", href: "/motorization" },
    ],
  },
  {
    slug: "what-drives-window-treatment-cost-las-vegas",
    crumb: "What drives the cost",
    title: "What drives the cost of window treatments in Las Vegas",
    seo: {
      title: "What Window Treatments Cost | Premier Shade Solutions",
      description:
        "Why one quote is higher than another: windows, sizes, product and fabric, how it operates, and extras. How custom window treatment pricing works in Las Vegas.",
    },
    published: "2026-10-22",
    updated: "2026-10-22",
    quickAnswer:
      "Five things set the price of custom window treatments: how many windows, how big they are, the product and fabric you choose, how it operates (cordless, chain or motorized), and any extras. We don't publish a price list because those five change with every home, but your quote is free and in writing, so you see every line before you say yes.",
    sections: [
      {
        heading: "Why there's no price list",
        paragraphs: [
          "Custom means each blind, shade or shutter is made to the exact size of your window. Two homes with the same number of windows can come out very differently, because the windows are different sizes and the rooms need different things. A price list would be wrong for almost everyone, so we price the windows you actually have.",
        ],
      },
      {
        heading: "1. How many windows",
        paragraphs: [
          "The biggest driver is simply the count. Covering the whole house at once is usually more efficient than doing it a room at a time, especially in newer homes where many windows are the same size. If you are only planning the front rooms, it is still worth asking for the whole house, so you can see the difference.",
        ],
      },
      {
        heading: "2. How big they are",
        paragraphs: [
          "A tall great-room window or a wide patio slider takes more material and more work than a bedroom window. Very wide openings can also change what is possible: composite shutter panels get heavy, so a wide opening may need extra stiles that interrupt the view, which we plan at the measurement rather than after the order.",
        ],
      },
      {
        heading: "3. The product and the fabric",
        paragraphs: [
          "Different products sit at different levels. Faux wood blinds are the practical everyday choice, and wood blinds bring the warmth of a shutter at a fraction of the cost. Composite shutters are generally more affordable than comparable real wood. Solar screens are the most cost-effective way to treat a whole west or south side of the house from outside. Within each product, the fabric or finish you choose moves the number too.",
        ],
      },
      {
        heading: "4. How it operates",
        paragraphs: [
          "A cordless or chain shade costs less than a motorized one. Motorization earns its place on windows nobody can reach and on rooms you want on a schedule, and modern battery motors need no electrician, so there is no wiring cost on top. Motorized products also take about a week longer to arrive.",
        ],
      },
      {
        heading: "5. Extras",
        paragraphs: [
          "Taking your old blinds down is priced per window on your quote, so there are no surprises on install day. Hauling them away is free. If the final measurement changes a size, the mounting or the product, you hear the new price first, and nothing is ordered until you approve it.",
        ],
      },
      {
        heading: "Getting a real number",
        paragraphs: [
          "The fastest way to a real number is the free in-home consultation. We bring samples to your windows, Josh measures every window himself, and you get a written quote with your lead time on it. No charge and no obligation.",
        ],
      },
    ],
    products: [
      { name: "Blinds", href: "/blinds" },
      { name: "Shades", href: "/shades" },
      { name: "Shutters", href: "/shutters" },
      { name: "Outdoor shading", href: "/outdoor" },
    ],
  },
  {
    slug: "composite-vs-wood-shutters-las-vegas",
    crumb: "Composite vs. wood shutters",
    title: "Composite vs. wood shutters in the Las Vegas sun",
    seo: {
      title: "Composite vs. Wood Shutters | Premier Shade Solutions",
      description:
        "Composite shutters won't warp, yellow or swell; real wood is lighter and shows its grain. Which plantation shutter belongs on which Las Vegas window.",
    },
    published: "2026-10-22",
    updated: "2026-10-22",
    quickAnswer:
      "For most Las Vegas windows, composite. A composite louver will not warp on a west-facing window, will not yellow, and will not swell in a bathroom. Real wood is lighter, so it allows wider panels and a cleaner view, and it is the only choice if you want visible grain, which makes it the pick for shaded windows and formal rooms.",
    sections: [
      {
        heading: "What each one is",
        paragraphs: [
          "Both are plantation shutters: wide-louver interior shutters built to the window opening and framed to the wall. The difference is the material. Composite shutters use an engineered wood or polymer core wrapped in a durable finish. Real wood shutters are milled from hardwood, usually basswood, and stained or painted.",
        ],
      },
      {
        heading: "The sun decides most of it",
        paragraphs: [
          "West-facing glass in this valley takes direct sun from about two in the afternoon until sunset. That is what kills wood: in sustained direct sun it can fade, and it moves. Composite removes the two things that ruin wood in the desert, sun and moisture, which is why it is our default for most Las Vegas homes and the reason we specify it far more often than real wood.",
          "Moisture matters too. A composite shutter is safe in bathrooms, laundry rooms and kitchens, where wood can swell.",
        ],
      },
      {
        heading: "Where real wood wins",
        paragraphs: [
          "Wood is significantly lighter than composite, so a wide opening can take wider panels before extra stiles are needed, which means a cleaner, more open view. And wood is the only option if you want visible grain: a stained wood shutter next to wood floors or exposed beams does something a painted composite cannot imitate.",
          "We specify real wood for shaded windows, interior openings and formal rooms, and steer people to composite for the west-facing glass.",
        ],
      },
      {
        heading: "Cost",
        paragraphs: [
          "Composite shutters are generally more affordable than comparable real wood. Both are among the longest-lasting things we install: on a hard west wall, a shutter still looks right in fifteen years when a fabric shade would have been replaced twice.",
        ],
      },
      {
        heading: "Mixing them",
        paragraphs: [
          "Many homes do both: composite on the sunny sides, the kitchen and the bathrooms, and wood in a shaded formal room where the grain can match the floors. We walk the house with you at the consultation and plan each window, including the louver size, which for the large modern glass in most Las Vegas homes is usually 4 1/2 inch.",
        ],
      },
    ],
    products: [
      { name: "Composite shutters", href: "/shutters/composite-shutters" },
      { name: "Real wood shutters", href: "/shutters/wood-shutters" },
      { name: "Plantation shutters", href: "/shutters/plantation-shutters" },
    ],
  },
  {
    slug: "window-treatments-for-sliding-glass-doors",
    crumb: "Sliding glass doors",
    title: "Window treatments for sliding glass doors in Las Vegas",
    seo: {
      title: "Sliding Door Window Treatments | Premier Shade Solutions",
      description:
        "Vertical blinds, cellular shades, solar screens or motorization: what works on Las Vegas sliding glass doors, and how to keep the door working as a door.",
    },
    published: "2026-10-22",
    updated: "2026-10-22",
    quickAnswer:
      "Vertical blinds are still the most sensible answer for most sliding glass doors: the vanes stack to one side so the door still works as a door, and they tilt to block the low western sun. Cellular shades stack small for tall glass, motorization handles glass too high to reach, and exterior solar screens take the heat off the patio-facing windows.",
    sections: [
      {
        heading: "The hardest opening in the house",
        paragraphs: [
          "Almost every Las Vegas home has a sliding glass door onto the patio, and it is usually the hardest opening to treat. It is wide, it is a door people walk through all day, and on the west side it takes the low afternoon sun straight into the room.",
          "Whatever goes on it has to do three things: leave the door usable, control that low sun, and still look right when it is open.",
        ],
      },
      {
        heading: "Vertical blinds",
        paragraphs: [
          "Verticals remain the most practical choice. The vanes stack left, right or split to the center, so the door still works as a door, and they tilt to block the low western sun that a horizontal blind cannot reach.",
          "Today's vertical is not the brittle plastic one you remember. Fabric-wrapped, faux wood and PVC vanes in warm neutrals hang straight and move quietly. Because the vanes hang rather than stack, they shed dust instead of collecting it, and a damaged vane replaces on its own.",
        ],
      },
      {
        heading: "Cellular shades and motorization",
        paragraphs: [
          "For tall glass, a cellular shade stacks remarkably small when it is raised, which keeps the opening usable, and its trapped air insulates against the afternoon heat. Where the glass runs higher than anyone can reach, motorization lets you open and close it from an app, a remote or a schedule, with a battery motor and no wiring.",
        ],
      },
      {
        heading: "Stop the heat outside",
        paragraphs: [
          "If the problem is heat more than light, exterior solar screens on the windows that face the patio turn away roughly 70–90% of the sun's heat before it reaches the glass. They darken the view a little from inside and are visible from outside, so we check your HOA's guidelines with you before ordering.",
        ],
      },
      {
        heading: "What about shutters?",
        paragraphs: [
          "Shutters can work on sliders, but very wide openings make composite panels heavy, and the panels have to clear the door handle and the path through the door. We plan the layout at the measurement, not after the order, and we will tell you honestly if a slider is better served by something else.",
        ],
      },
    ],
    products: [
      { name: "Vertical blinds", href: "/blinds/vertical-blinds" },
      { name: "Cellular shades", href: "/shades/cellular-shades" },
      { name: "Motorization", href: "/motorization" },
      { name: "Solar screens", href: "/outdoor/solar-screens" },
    ],
  },
];

/**
 * Guides written but not published: not routed and not in the sitemap. Move one into `articles` to publish.
 * (The brands guide waited here until the owner confirmed, 2026-10-22, that PSS may use its vendors' names.)
 */
export const HELD_ARTICLES: Article[] = [];

export const articleBySlug = (slug: string): Article | undefined => articles.find((a) => a.slug === slug);

/** The buying guides that answer a question about this page, for its "More reading" links. */
export const articlesFor = (href: string): Article[] => articles.filter((a) => a.products.some((p) => p.href === href));

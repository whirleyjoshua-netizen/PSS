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
        "An Authorized Hunter Douglas Dealer in Las Vegas that also carries Alta and Norman, measured and installed by our family. Compare makers at your window.",
    },
    published: "2026-10-22",
    updated: "2026-10-22",
    quickAnswer:
      "We are an Authorized Hunter Douglas Dealer and also carry Alta and Norman, so at your free consultation we can show you more than one maker's answer for the same window, and tell you honestly which one fits. Whichever you choose, we measure it and install it ourselves.",
    sections: [
      {
        heading: "Why we carry more than one brand",
        paragraphs: [
          "Many window treatment companies sell one maker's line, so every window gets that maker's answer. We carry three: as an Authorized Hunter Douglas Dealer we offer Hunter Douglas, and we also carry Alta and Norman, which means we can put more than one option in front of your window and let you see the difference in your own light.",
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
    // Monthly guide 1 (SEO audit 2026-10-27). Claims only from content/faq.ts, content/products.ts and the guides above.
    slug: "west-facing-windows-las-vegas",
    crumb: "West-facing windows",
    title: "The best window treatments for west-facing windows in Las Vegas",
    seo: {
      title: "West-Facing Window Treatments | Premier Shade Solutions",
      description:
        "West-facing glass in Las Vegas takes direct sun from about 2 p.m. to sunset. What stops the heat, what keeps the view, and what to choose for each room.",
    },
    published: "2026-10-27",
    updated: "2026-10-27",
    quickAnswer:
      "Start outside: an exterior solar screen turns away roughly 70–90% of the sun's heat before it reaches a west-facing window. Inside, choose by room: a solar shade where you want the view without the glare, a solar-and-blackout dual roller in bedrooms, composite shutters where you want something permanent, and motorization so the shades close themselves before the afternoon sun arrives.",
    sections: [
      {
        heading: "Why west windows are the hard ones",
        paragraphs: [
          "West-facing glass in the Las Vegas valley takes direct sun from about two in the afternoon until sunset, in the hottest part of the day. The sun is low by then, so it reaches deep into the room instead of stopping at the sill. That is the window that heats the room you avoid in July, puts glare on the television and slowly bleaches the floor in front of it.",
          "No single product fixes all of that. The best answer is usually two layers: one that stops the heat and one that controls the light.",
        ],
      },
      {
        heading: "Stop the heat before it reaches the glass",
        paragraphs: [
          "Heat is easiest to handle outside. An exterior solar screen mounted over the window rejects roughly 70–90% of the sun's heat, depending on the mesh, before it gets to the glass. That makes screens the most economical way to treat a whole west wall.",
          "Screens can be seen from the street, so we usually put them on the sides of the house that take the beating, and we check your HOA's guidelines with you before ordering.",
        ],
      },
      {
        heading: "Inside, choose by room",
        paragraphs: [
          "Living room and home office: a solar shade. It cuts glare and blocks up to 99% of UV while you still see out. The openness factor sets the balance: a tight 3% fabric turns away more heat and UV, a 10% keeps a crisper view. We pick it window by window.",
          "Bedroom: a solar fabric and a blackout on one dual roller, so the room has a view by day and real darkness at night. For anyone who sleeps days, the blackout gets side channels to close the light gaps.",
          "Front rooms and formal rooms: composite shutters. Composite won't warp or yellow in direct sun, and the louvers tilt to send the low afternoon sun up toward the ceiling instead of into your eyes.",
          "Patio slider: vertical blinds, whose vanes tilt to block the low western sun and stack to one side, or composite shutters on a bi-fold or bypass track that clear the door.",
        ],
      },
      {
        heading: "What to keep off west glass",
        paragraphs: [
          "Real wood shutters fade in sustained direct sun, so we keep wood for the shaded sides of the house and use composite on the west. A sheer shade on its own softens glare but doesn't block heat; on a west window, pair it with a solar screen outside.",
        ],
      },
      {
        heading: "Let the shades close themselves",
        paragraphs: [
          "The afternoon sun arrives whether or not anyone is home. Motorized shades can close on a schedule every summer afternoon, and with Alta's BLISS® Automation you can set timers by the clock or by your local sunrise and sunset. They are also the answer for tall west glass nobody can reach.",
        ],
      },
      {
        heading: "Which of your windows face west",
        paragraphs: [
          "At your free consultation we walk the house with you, note which windows take the afternoon sun, and bring screen, shade and shutter samples to hold up in your own light. Josh measures every window himself, backed by our measurement guarantee, and we install everything ourselves.",
        ],
      },
    ],
    products: [
      { name: "Solar screens", href: "/outdoor/solar-screens" },
      { name: "Solar shades", href: "/shades/solar-shades" },
      { name: "Composite shutters", href: "/shutters/composite-shutters" },
      { name: "Sliding door shutters", href: "/shutters/sliding-door-shutters" },
      { name: "Motorization", href: "/motorization" },
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

import { WARRANTY } from "./warranty";

/**
 * Buying guides at /learn/<slug> (SEO plan 2026-10-21, from the 10-17 keyword research: the comparison page, the
 * blackout page and the brands page). Not repair guides: those are content/guides.ts.
 *
 * DRAFT until the owner approves them (docs/marketing/2026-10-22-seo-drafts-review.md). Every product claim comes
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
          "A solar screen darkens the view a little from inside and can be seen from the street, so we put them on the sides of the house that take the beating rather than the front. Because they are on the outside, they are also the product HOA guidelines most often cover, so we check yours before ordering.",
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
          "Most window treatment companies sell one maker's line, so every window gets that maker's answer. We carry three, Hunter Douglas, Alta and Norman, which means we can put more than one option in front of your window and let you see the difference in your own light.",
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
];

export const articleBySlug = (slug: string): Article | undefined => articles.find((a) => a.slug === slug);

/** The buying guides that answer a question about this page, for its "More reading" links. */
export const articlesFor = (href: string): Article[] => articles.filter((a) => a.products.some((p) => p.href === href));

/**
 * Repair and care guides (spec docs/superpowers/specs/2026-10-03-repair-guides-design.md).
 *
 * Every guide page, the /guides index and the sitemap read from this file, so
 * adding a guide is an edit here plus, if it needs a new picture, one diagram
 * component. Copy is drafted for the owner to check before it goes live: a
 * wrong repair step costs more trust than no guide.
 *
 * Written for the Las Vegas valley, like content/products.ts: dust, heat and
 * afternoon sun are the real causes, so say so.
 */

import type { CategorySlug, Seo } from "@/content/products";

export const DIAGRAM_IDS = [
  "cellular-lower",
  "cellular-pull-45",
  "cellular-tug",
  "cellular-raise",
  "slat-plugs",
  "slat-cord-up",
  "slat-swap",
  "slat-reknot",
] as const;

export type DiagramId = (typeof DIAGRAM_IDS)[number];

export type GuideStep = {
  title: string;
  /** Plain text, one paragraph. */
  body: string;
  diagram: DiagramId;
  /** Adds "· side view" to the step label. */
  sideView?: boolean;
};

export type Guide = {
  slug: string;
  category: CategorySlug;
  /** Short name for the breadcrumb. */
  crumb: string;
  /** The H1, phrased the way people search. */
  title: string;
  seo: Seo;
  minutes: number;
  tools: string;
  /** ISO dates. `updated` is shown on the page and sent as dateModified. */
  published: string;
  updated: string;
  quickAnswer: string;
  steps: GuideStep[];
  why: string;
  cta: { eyebrow: string; headline: string; body: string };
  faq: { q: string; a: string }[];
  related: string[];
};

export const guides: Guide[] = [
  {
    slug: "cordless-cellular-shade-wont-stay-up",
    category: "shades",
    crumb: "Cordless shade won't stay up",
    title: "Cordless cellular shade won't stay up? Reset it in 4 steps",
    seo: {
      title: "Fix a Cordless Shade That Drops | Premier Shade Solutions",
      description:
        "A cordless cellular shade that drifts down usually needs its spring reset. Four steps, two minutes, no tools, with diagrams from Las Vegas installers.",
    },
    minutes: 2,
    tools: "No tools",
    published: "2026-10-03",
    updated: "2026-10-03",
    quickAnswer:
      "Lower the shade all the way, pull the bottom rail toward you at about 45°, give it three short tugs, then raise it. That resets the spring in the headrail. If it still drops, the spring is worn out.",
    steps: [
      {
        title: "Lower the shade all the way",
        body: "Pull the bottom rail straight down until the shade is fully open and stops on its own.",
        diagram: "cellular-lower",
      },
      {
        title: "Pull it toward you at 45°",
        body: "Hold the middle of the bottom rail and bring it out from the window at about a 45° angle.",
        diagram: "cellular-pull-45",
        sideView: true,
      },
      {
        title: "Give it three short tugs",
        body: "Keep the angle. Quick and gentle, not hard. This re-engages the spring inside the headrail.",
        diagram: "cellular-tug",
        sideView: true,
      },
      {
        title: "Raise it, then let go halfway",
        body: "Lift the shade and release it in the middle of the window. If it holds, you're done.",
        diagram: "cellular-raise",
      },
    ],
    why:
      "Cordless shades hold their place with a spring motor inside the headrail. Raising the shade too fast, pulling from one corner, or the fine desert dust that settles into Las Vegas headrails can knock the spring out of balance. After enough years the spring simply wears out, and no reset will bring it back.",
    cta: {
      eyebrow: "Still dropping?",
      headline: "It may be time for a new shade",
      body: "A worn spring can't be fixed at home on most shades. We measure every window for free and bring cordless and motorized samples to you.",
    },
    faq: [
      {
        q: "Can I replace the spring myself?",
        a: "On most brands, no. The spring is sealed inside the headrail, and opening it usually ruins the shade. Replacing the shade is often cheaper than a repair.",
      },
      {
        q: "Why does my shade only drop on one side?",
        a: "One lift cord inside has slipped. Lower the shade fully and do the 45° reset, which lets both cords settle to the same length. If it is still crooked, that cord has worn.",
      },
      {
        q: "Will this work on my brand?",
        a: "Most cordless cellular shades use a spring motor and respond to this reset. If yours has a button or a wand on the headrail, it uses a different mechanism. Call us and we'll walk you through it.",
      },
    ],
    related: ["replace-a-broken-blind-slat"],
  },
  {
    slug: "replace-a-broken-blind-slat",
    category: "blinds",
    crumb: "Replace a broken slat",
    title: "How to replace a broken blind slat in 4 steps",
    seo: {
      title: "Replace a Broken Blind Slat | Premier Shade Solutions",
      description:
        "Swap one cracked slat without replacing the whole blind. Four steps with diagrams, a screwdriver and fifteen minutes, from Las Vegas installers.",
    },
    minutes: 15,
    tools: "Flathead screwdriver",
    published: "2026-10-03",
    updated: "2026-10-03",
    quickAnswer:
      "Pop the plugs out of the bottom rail, untie the lift cord and pull it up just past the broken slat, slide the broken slat out of the ladder and a spare one in, then rethread the cord and tie it off. No spare? Borrow the bottom slat.",
    steps: [
      {
        title: "Pop out the bottom-rail plugs",
        body: "Lower the blind all the way and tilt the slats open. Use a flathead screwdriver to pry out the small plugs on the underside of the bottom rail. The lift cords are knotted underneath.",
        diagram: "slat-plugs",
      },
      {
        title: "Untie the cord and pull it up",
        body: "Untie the knot on each lift cord and gently pull the cord up through the slats until its end sits just above the broken slat. Don't pull it out of the headrail.",
        diagram: "slat-cord-up",
      },
      {
        title: "Swap the slat",
        body: "Slide the broken slat sideways out of the ladder strings, then slide the new one in the same way, curved side matching its neighbors. No spare? Use the bottom slat; a missing bottom slat is hard to spot.",
        diagram: "slat-swap",
      },
      {
        title: "Rethread and tie off",
        body: "Feed each cord back down through every slat and the bottom rail. Tie a knot so both sides hang level, tuck it in and press the plugs back in.",
        diagram: "slat-reknot",
      },
    ],
    why:
      "Slats crack when they are pulled while closed, bumped by a pet or a child, or baked by afternoon sun. Vinyl slats on west-facing Las Vegas windows turn brittle fastest.",
    cta: {
      eyebrow: "More than a couple cracked?",
      headline: "Sun-damaged slats keep breaking",
      body: "Once the vinyl has gone brittle, the next slat is not far behind. We measure for free and show you faux wood and shades made for desert sun.",
    },
    faq: [
      {
        q: "Where do I get a replacement slat?",
        a: "Take a broken piece to a home store to match the width and color, or ask the blind's maker for a spare. If we installed your blinds, call us and we'll find a match.",
      },
      {
        q: "My slats have no holes for the cord. Now what?",
        a: "Some blinds run the cord around the back edge of each slat instead. The steps are the same: free the cord, swap the slat, and rethread it around the same edge.",
      },
      {
        q: "Can I just glue a cracked slat?",
        a: "Clear tape or glue on the back holds for a while, but cracked vinyl keeps splitting. Replacing the slat takes about fifteen minutes.",
      },
    ],
    related: ["cordless-cellular-shade-wont-stay-up"],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}

/** "1 minute", "15 minutes". */
export function minutesLabel(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** "Oct 2026". Noon UTC so no time zone can roll the date into another month. */
export function updatedLabel(guide: Guide): string {
  return new Date(`${guide.updated}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

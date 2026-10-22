import { leadTimes } from "@/content/lead-times";
import type { CategorySlug } from "@/content/products";

/**
 * The ad landing page, /consultation and /consultation/<category> (spec 2026-10-08).
 *
 * Built from the 2026-10-08 voice-of-customer research (docs/marketing/voice-of-customer.md
 * on feat/voc-scraper): 2–4 star Google reviews of the five biggest Las Vegas window
 * companies. The five pains below are the five most-repeated complaints, headed in the
 * words customers use. Every answer is something the owner confirmed on 2026-10-08:
 * free haul-away, clean-up, a walkthrough at install, free temporary shades, texting the owners, and the measurement
 * guarantee ("we guarantee our measures cause I do them" — Josh measures every window).
 * Change a promise here only after the owner confirms the new one is true.
 */

const weeks = (label: string) => {
  const found = leadTimes.find((leadTime) => leadTime.label === label);
  if (!found) throw new Error(`No lead time for ${label}`);
  return `${found.minWeeks}–${found.maxWeeks} weeks`;
};

/** "3–5 weeks for blinds and shades, 6–10 weeks for shutters", read from content/lead-times.ts. */
export const LEAD_TIME_LINE = `${weeks("Blinds")} for blinds and shades, ${weeks("Shutters")} for shutters`;

/** Where the weeks start (owner 2026-10-13: the order, not the consult). Every lead-time sentence says it. */
export const LEAD_TIME_START = "counted from the day you order";

/**
 * How soon we call after a consultation request (owner 2026-10-13: within a business day, was 3). The thank-you
 * pages, /contact and the confirmation email all quote it. Not the contract's 3-business-day cancellation window.
 */
export const CALLBACK_WINDOW = "within a business day";

/**
 * What we do that other window companies often don't. Owner 2026-10-21, from the marketing consultant: no quoted
 * complaints ("It took forever.") above the answers, because people skimming read them as reviews of us.
 */
export type Pain = {
  /** The headline of our answer. */
  answer: string;
  body: string;
};

export const PAINS: Pain[] = [
  {
    answer: "Your lead time, in writing",
    body: `Your quote says when to expect your install: ${LEAD_TIME_LINE}, ${LEAD_TIME_START}. Need privacy while you wait? We put up temporary shades, free.`,
  },
  {
    answer: "Our measurement guarantee",
    body: "Josh measures every window himself, and we stand behind every number. If a measurement is off, we remake it and install it again, free.",
  },
  {
    answer: "Not customer service. Personal service.",
    body: "No call center and no sales rep to chase. You text the owners, Shade’ and Josh, directly, and your project page shows where your order is, any time.",
  },
  {
    answer: "We leave it cleaner.",
    body: "We protect your floors, clean up and vacuum before we go, and haul your old blinds away for free.",
  },
  {
    answer: "From your first call to the final install, we're family.",
    body: "We are a Las Vegas family business, and we never hand you off to a third party for install. We walk through every window with you before we go, and we stand behind the job.",
  },
];

/**
 * The homepage's "What makes us different" block: the first four pains, the fears people have before they book. The
 * fifth ("we're family") is left out there because the homepage already says it in its own sections. /consultation
 * and /holiday show all five (components/consultation/LandingSections.tsx).
 */
export const HOME_OBJECTIONS: Pain[] = PAINS.slice(0, 4);

export const STEPS = [
  { title: "Invite us over.", body: "We bring samples to your home, so you see every color and fabric in your own light." },
  { title: "Josh measures.", body: "Every window, by the owner, backed by our measurement guarantee." },
  { title: "Your written quote", body: `With your lead time on it: ${LEAD_TIME_LINE}, ${LEAD_TIME_START}.` },
  { title: "Install day", body: "We install, walk through every window with you, clean up, and haul your old blinds away free." },
];

export const FAQ = [
  {
    q: "How long until my install?",
    a: `${LEAD_TIME_LINE[0]!.toUpperCase()}${LEAD_TIME_LINE.slice(1)}, ${LEAD_TIME_START}. It is written on your quote, and we put up temporary shades for free while you wait.`,
  },
  {
    q: "What if something doesn't fit?",
    a: "Josh measures every window himself and we guarantee those measurements. If one is off, we remake it and install it again at no cost to you.",
  },
  {
    q: "What happens to my old blinds?",
    a: "Hauling them away is free. Taking them down is priced per window on your quote, so you see it before you say yes.",
  },
  {
    q: "Is the consultation really free?",
    a: "Yes. We come to you, bring the samples, measure and quote. No charge and no obligation.",
  },
];

/** The ad groups' landing variants: the headline noun and the lead's treatment (a category name). */
export const LANDING_VARIANTS: Partial<Record<CategorySlug, { noun: string }>> = {
  blinds: { noun: "Blinds" },
  shades: { noun: "Shades" },
  shutters: { noun: "Shutters" },
  motorization: { noun: "Motorized Shades" },
  outdoor: { noun: "Patio Shades" },
};

export const landingTitle = (noun = "Windows") => `Beautiful ${noun}, Measured Right the First Time`;

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

export type Pain = {
  /** The complaint, in the words customers use in reviews. */
  heard: string;
  /** The headline of our answer. */
  answer: string;
  body: string;
};

export const PAINS: Pain[] = [
  {
    heard: "“It took forever.”",
    answer: "Your lead time, in writing",
    body: `Your quote says when to expect your install: ${LEAD_TIME_LINE}. Need privacy while you wait? We put up temporary shades, free.`,
  },
  {
    heard: "“They measured wrong.”",
    answer: "Our measurement guarantee",
    body: "Josh measures every window himself, and we stand behind every number. If a measurement is off, we remake it and install it again, free.",
  },
  {
    heard: "“Nobody called me back.”",
    answer: "Text the owners",
    body: "No call center and no sales rep to chase. You text Shade’ or Josh directly, and your project page shows where your order is, any time.",
  },
  {
    heard: "“The crew left a mess.”",
    answer: "We leave it cleaner",
    body: "We protect your floors, clean up and vacuum before we go, and haul your old blinds away for free.",
  },
  {
    heard: "“Once they had my money, they disappeared.”",
    answer: "From your first call to the final install, we're family",
    body: "We are a Las Vegas family business, and we never hand you off to a third party for install. We walk through every window with you before we go, and we stand behind the job.",
  },
];

export const STEPS = [
  { title: "Invite us over", body: "We bring samples to your home, so you see every color and fabric in your own light." },
  { title: "Josh measures", body: "Every window, by the owner, backed by our measurement guarantee." },
  { title: "Your written quote", body: `With your lead time on it: ${LEAD_TIME_LINE}.` },
  { title: "Install day", body: "We install, walk through every window with you, clean up, and haul your old blinds away free." },
];

export const FAQ = [
  {
    q: "How long until my install?",
    a: `${LEAD_TIME_LINE[0]!.toUpperCase()}${LEAD_TIME_LINE.slice(1)}, counted from the day you order. It is written on your quote, and we put up temporary shades for free while you wait.`,
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

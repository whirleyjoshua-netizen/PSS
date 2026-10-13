import type { LeadTime } from "@/lib/lead-times";

/**
 * Weeks from the day the client orders to install (owner 2026-10-13: counted from the order, not the consult). Must agree with §8 of the starter terms
 * (lib/docs/starter-terms.ts); tests/content/lead-times.test.ts holds the two together. The holiday strip's
 * dropdown and the customer project page's production estimate both read from here.
 */
export const leadTimes: LeadTime[] = [
  { label: "Blinds", minWeeks: 3, maxWeeks: 5 },
  { label: "Shades", minWeeks: 3, maxWeeks: 5 },
  { label: "Shutters", minWeeks: 6, maxWeeks: 10 },
];

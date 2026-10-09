import type { Promo } from "@/lib/promo";

/**
 * The strips above the header, in order. Their windows must not overlap: each hides itself outside its own window,
 * so the page switches from one to the next on time without a redeploy. For a new message or season, change the
 * text and dates and give it a new `id` (that re-shows it to people who closed the last one).
 */

/** Owner, 2026-10-09: 10% off 3+ custom shades, booked by Nov 15, so the order can still be installed before Dec 24. */
export const holidayOffer: Promo = {
  id: "holiday-10-off-2026",
  message: "Holiday special: 10% off 3 or more custom shades. Book by Nov 15.",
  shortMessage: "10% off 3+ shades",
  cta: "Free in-home consult →",
  shortCta: "Book by Nov 15 →",
  href: "/contact",
  startsAt: "2026-10-09T00:00:00-07:00",
  // The end of Nov 15 in Las Vegas (PST).
  endsAt: "2026-11-16T00:00:00-08:00",
  arriveBy: { day: "2026-12-24", note: "may be after Christmas" },
};

/**
 * Mood first, no deadline: custom orders take weeks (content/lead-times.ts), so the nudge is to book before
 * the family arrives. It takes over when the offer ends.
 */
export const holidayPromo: Promo = {
  id: "holiday-2026",
  message: "The holidays are coming. Give your home a fresh look before the family arrives.",
  shortMessage: "Holiday-ready?",
  cta: "Free in-home consult →",
  shortCta: "Free consult →",
  href: "/contact",
  startsAt: holidayOffer.endsAt,
  // The end of Dec 24 in Las Vegas (PST).
  endsAt: "2026-12-25T00:00:00-08:00",
  arriveBy: { day: "2026-12-24", note: "may be after Christmas" },
};

export const promos: Promo[] = [holidayOffer, holidayPromo];

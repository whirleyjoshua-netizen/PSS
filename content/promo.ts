import type { Promo } from "@/lib/promo";

/**
 * The strip above the header. Mood first, no deadline: custom orders take weeks (content/lead-times.ts), so the nudge is to book before
 * the family arrives. For a new message or season, change the text and dates and give it a new `id`.
 */
export const holidayPromo: Promo = {
  id: "holiday-2026",
  message: "The holidays are coming. Give your home a fresh look before the family arrives.",
  shortMessage: "Holiday-ready?",
  cta: "Free in-home consult →",
  shortCta: "Free consult →",
  href: "/contact",
  startsAt: "2026-10-01T00:00:00-07:00",
  // The end of Dec 24 in Las Vegas (PST).
  endsAt: "2026-12-25T00:00:00-08:00",
  arriveBy: { day: "2026-12-24", note: "may be after Christmas" },
};

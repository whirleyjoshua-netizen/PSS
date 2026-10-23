import { isPromoLive } from "@/lib/promo";
import { leadTimeSummary } from "@/lib/lead-times";
import { leadTimes } from "./lead-times";
import { holidayOffer, holidayPromo } from "./promo";
import { HD_RESTRICTED_EXCLUSION, HD_RESTRICTED_NOTE } from "./offer-terms";

/**
 * The /holiday ad landing page (spec 2026-10-10). It follows the banner's dates in content/promo.ts: the 10% offer
 * while `holidayOffer` runs, the "before the family arrives" message while `holidayPromo` runs, then the page
 * redirects to /consultation. Owner 2026-10-10: the 10% covers 3+ custom shades or blinds, motorized included,
 * shutters excluded, with the consult booked by Nov 15.
 */
export type HolidayStage = "offer" | "family" | "over";

export function holidayStage(now: Date): HolidayStage {
  if (isPromoLive(holidayOffer, now)) return "offer";
  if (isPromoLive(holidayPromo, now)) return "family";
  return "over";
}

/** The offer's last day to book in Las Vegas, e.g. "Nov 15": the day before `endsAt`, which is exclusive. */
export const HOLIDAY_OFFER_LAST_DAY = new Date(new Date(holidayOffer.endsAt).getTime() - 1).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});

export const HOLIDAY_OFFER_LINE = `10% off 3 or more custom shades or blinds. Book your free consult by ${HOLIDAY_OFFER_LAST_DAY}.`;

/** The /holiday page's fine print under the offer (content/offer-terms.ts). */
export const HOLIDAY_OFFER_FINEPRINT = HD_RESTRICTED_EXCLUSION;

/** The homepage hero form's one line, above Invite Us Over while the offer runs (components/home/HeroOffer.tsx). */
export const HOLIDAY_FORM_LINE = `Holiday: 10% off 3+ shades or blinds when you book by ${HOLIDAY_OFFER_LAST_DAY}.`;

/** Rides along on an offer-window lead as its notes, so Shade’ knows to take the 10% off the quote. */
export const HOLIDAY_LEAD_NOTE = `Holiday special: 10% off 3+ custom shades or blinds (consult booked by ${HOLIDAY_OFFER_LAST_DAY}). ${HD_RESTRICTED_NOTE}`;

const weeks = (label: string) => {
  const leadTime = leadTimes.find((l) => l.label === label)!;
  return `${leadTime.minWeeks}–${leadTime.maxWeeks} weeks`;
};

export function holidayLeadTimes(stage: "offer" | "family"): string {
  const line = `From the day you order: ${leadTimeSummary(leadTimes)}.`;
  return stage === "offer" ? `${line} Shutters aren't part of the 10%.` : line;
}

export function holidayFaq(stage: "offer" | "family"): { q: string; a: string }[] {
  const christmas = {
    q: "Will it be installed by Christmas?",
    a: `Shades and blinds take ${weeks("Shades")} from the day you order, and shutters ${weeks("Shutters")}. The sooner we come out, the better your chances. Your lead time is in writing on your quote, and if it lands after the holidays we put up temporary shades for free.`,
  };
  const tenOff = {
    q: "What counts toward the 10%?",
    a: `Three or more custom shades or blinds on one order, motorized included, with your consult booked by ${HOLIDAY_OFFER_LAST_DAY}. Shutters aren't included.`,
  };
  return stage === "offer" ? [christmas, tenOff] : [christmas];
}

/** The three promises from the owner's holiday flyer. */
export const HOLIDAY_ICONS = [
  { label: "More comfort", icon: "home" },
  { label: "Beautiful curb appeal", icon: "sparkle" },
  { label: "A space you'll love", icon: "heart" },
] as const;

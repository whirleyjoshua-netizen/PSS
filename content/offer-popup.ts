import { isPromoLive, type Season } from "@/lib/promo";
import { holidayOffer, solarOffer } from "./promo";
import { HOLIDAY_FORM_LINE, HOLIDAY_LEAD_NOTE, HOLIDAY_OFFER_LAST_DAY } from "./holiday";
import { SOLAR_FORM_LINE, SOLAR_LEAD_NOTE } from "./solar-offer";

/**
 * The offer pop-up (owner 2026-10-21, from the marketing consultant): a visitor who isn't ready to book leaves a
 * name and email to get the offer, so we can follow up. It shows the offers running at that moment, and nothing
 * when none is.
 */
export type PopupOffer = { line: string; note: string; season: Season };

export const POPUP_OFFERS: readonly PopupOffer[] = [
  { line: HOLIDAY_FORM_LINE, note: HOLIDAY_LEAD_NOTE, season: holidayOffer },
  { line: SOLAR_FORM_LINE, note: SOLAR_LEAD_NOTE, season: solarOffer },
];

export const liveOffers = (now: Date): PopupOffer[] => POPUP_OFFERS.filter((offer) => isPromoLive(offer.season, now));

export const OFFER_POPUP = {
  heading: "Save on custom window treatments.",
  intro: `Not ready to book yet? Send us your name and email and we'll email you the offer, good when you book your free consult by ${HOLIDAY_OFFER_LAST_DAY}.`,
  button: "Email me the offer",
  sentHeading: "Check your email.",
  sentBody: "The offer is on its way. When you're ready, book a time online or call us.",
} as const;

/** Seconds on the page, or how far down it, before the pop-up appears; whichever comes first (owner 2026-10-21). */
export const OFFER_DELAY_MS = 20_000;
export const OFFER_SCROLL_SHARE = 0.5;

/** Set when the pop-up has shown, so it shows once per browser. A new key would show it again to everyone. */
export const OFFER_SEEN_KEY = "pss-offer-popup-seen:fall-2026";
/** Set when any lead form or the pop-up was sent: someone who already reached us never sees the pop-up. */
export const LEAD_SENT_KEY = "pss-lead-sent";

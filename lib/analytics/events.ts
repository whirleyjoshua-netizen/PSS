import { sendGAEvent } from "@next/third-parties/google";
import type { LeadSource } from "@/lib/leads/schema";

/**
 * The GA4 events Google Ads imports as conversions once GA4 is linked to the
 * Ads account. generate_lead is GA4's own recommended name, so it imports
 * without renaming. Booked and sold jobs reach Google Ads separately, through
 * the conversions file in Settings.
 */
export const EVENTS = { lead: "generate_lead", phone: "phone_click" } as const;

/** Where a tap on our number is a lead already counted or an existing customer, not a new lead. */
const NOT_A_NEW_LEAD = ["/thank-you", "/project"];

/** Analytics can be blocked or not loaded yet; a missed event must never break the page. */
function send(name: string, params: Record<string, string>) {
  try {
    sendGAEvent("event", name, params);
  } catch {
    // The lead or the call still happens; only the count is lost.
  }
}

export const trackLead = (form: LeadSource) => send(EVENTS.lead, { form });

/** Counts a click that landed on, or inside, a tel: link. Anything else is ignored. */
export function trackPhoneClick(event: Event, pathname: string): void {
  const link = event.target instanceof Element ? event.target.closest('a[href^="tel:"]') : null;
  if (!link) return;
  if (NOT_A_NEW_LEAD.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return;
  send(EVENTS.phone, { page: pathname });
}

import { calendarConfig } from "@/lib/calendar/config";

export { DC_NEW_QUOTE_URL, dcQuoteUrl } from "./links";

/** Verified 2026-09-27: DC sends through HD's address, whatever the display name says. */
export const DC_SENDER = "retailer@hunterdouglas.com";
export const DC_SUBJECT = /^DEALER COPY #(\d+), PO (.+)$/;
export const IMPORT_ACTOR = "Direct Connect";
/** The support@ mailbox the calendar app already reads. Null when Outlook is not configured. */
export const dcMailbox = (): string | null => calendarConfig()?.mailbox ?? null;

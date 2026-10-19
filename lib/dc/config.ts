import { calendarConfig } from "@/lib/calendar/config";

export { DC_NEW_QUOTE_URL, dcQuoteUrl } from "./links";

/** Verified 2026-09-27: DC sends through HD's address, whatever the display name says. */
export const DC_SENDER = "retailer@hunterdouglas.com";
export const DC_SUBJECT = /^DEALER COPY #(\d+), PO (.+)$/;
/** Verified 2026-10-12: DC's receipt for a submitted order, from the same sender as a Dealer Copy. */
export const RECEIPT_SUBJECT = /^Confirming Receipt of Quote #(\d+) \/ Sidemark: /;
/** Verified 2026-10-12: HD's confirmation of an order comes from a different address than DC's mail. */
export const ORDER_SENDER = "donotreply@hunterdouglas.com";
export const ORDER_SUBJECT = /^New Order # (\d+) for Sidemark: /;
export const IMPORT_ACTOR = "Direct Connect";
/** The support@ mailbox the calendar app already reads. Null when Outlook is not configured. */
export const dcMailbox = (): string | null => calendarConfig()?.mailbox ?? null;

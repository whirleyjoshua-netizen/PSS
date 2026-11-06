import { conversionsFeedHandler } from "@/lib/ads/conversions-feed-http";

/** Only the "Appointment booked" rows, for the Data Manager connection tied to that action. */
export const dynamic = "force-dynamic";

export const GET = conversionsFeedHandler("booked");

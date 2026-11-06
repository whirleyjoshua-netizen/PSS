import { conversionsFeedHandler } from "@/lib/ads/conversions-feed-http";

/** Only the "Consultation request" rows, for the Data Manager connection tied to that action. */
export const dynamic = "force-dynamic";

export const GET = conversionsFeedHandler("lead");

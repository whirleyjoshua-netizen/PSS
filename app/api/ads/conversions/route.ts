import { conversionsFeedHandler } from "@/lib/ads/conversions-feed-http";

/** Every conversion action in one file: the owner's reference copy. Data Manager uses the per-action addresses below this one. */
export const dynamic = "force-dynamic";

export const GET = conversionsFeedHandler();

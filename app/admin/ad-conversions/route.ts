import { requireAdmin } from "@/lib/admin/session";
import { conversionsCsvNow } from "@/lib/leads/conversions-feed";

/**
 * Downloads every ad-click lead still inside Google's 90-day window as an
 * offline conversion file. Re-uploading the same rows is harmless: Google
 * skips a conversion it has already recorded for that click, name and time.
 * Google Ads Data Manager fetches the same file from /api/ads/conversions.
 */
export async function GET() {
  await requireAdmin();

  return new Response(await conversionsCsvNow(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="google-ads-conversions.csv"`,
      "cache-control": "no-store",
    },
  });
}

import "server-only";
import { db } from "@/lib/db";
import { BOOKED_OR_LATER, SOLD_OR_LATER } from "@/lib/admin/stages";
import { ATTRIBUTION_DAYS } from "./attribution";
import { conversionsCsv, type ConversionRow } from "./conversions";

/**
 * Every ad-click lead still inside Google's 90-day window, as the offline
 * conversion file. Served both to the owner as a download and to Google Ads
 * Data Manager as a scheduled HTTPS source. Re-sending the same rows is
 * harmless: Google skips a conversion it has already recorded for that click,
 * name and time.
 */
export async function conversionsCsvNow(): Promise<string> {
  // Reaching a stage counts from its first stage entry, so a job that skipped
  // ahead (booked straight to ordered) still reports when it was won. Both lists
  // come from the one stage definition, so a new stage counts without editing this.
  const rows = await db().query(
    `select l.gclid, l.source, l.created_at, l.sold_cents,
       (select min(e.created_at) from job_events e where e.lead_id = l.id and e.kind = 'stage'
          and e.to_status = any($2::text[])) as booked_at,
       (select min(e.created_at) from job_events e where e.lead_id = l.id and e.kind = 'stage'
          and e.to_status = any($3::text[])) as sold_at
     from leads l
     where l.gclid is not null
       and coalesce(l.ad_clicked_at, l.created_at) > now() - make_interval(days => $1)
     order by l.created_at`,
    [ATTRIBUTION_DAYS, [...BOOKED_OR_LATER], [...SOLD_OR_LATER]],
  );

  return conversionsCsv(
    rows.map((row): ConversionRow => ({
      gclid: row.gclid as string,
      source: row.source as string,
      createdAt: new Date(row.created_at as string),
      bookedAt: row.booked_at ? new Date(row.booked_at as string) : null,
      soldAt: row.sold_at ? new Date(row.sold_at as string) : null,
      soldCents: (row.sold_cents as number | null) ?? null,
    })),
  );
}

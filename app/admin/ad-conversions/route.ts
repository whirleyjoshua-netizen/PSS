import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/session";
import { ATTRIBUTION_DAYS } from "@/lib/leads/attribution";
import { conversionsCsv, type ConversionRow } from "@/lib/leads/conversions";

/**
 * Downloads every ad-click lead still inside Google's 90-day window as an
 * offline conversion file. Re-uploading the same rows is harmless: Google
 * skips a conversion it has already recorded for that click, name and time.
 */
export async function GET() {
  await requireAdmin();

  // Reaching a stage counts from its first stage entry, so a job that skipped
  // ahead (booked straight to ordered) still reports when it was won.
  const rows = await db().query(
    `select l.gclid, l.created_at, l.sold_cents,
       (select min(e.created_at) from job_events e where e.lead_id = l.id and e.kind = 'stage'
          and e.to_status in ('visit_booked', 'quoted', 'sold', 'ordered', 'installed', 'completed')) as booked_at,
       (select min(e.created_at) from job_events e where e.lead_id = l.id and e.kind = 'stage'
          and e.to_status in ('sold', 'ordered', 'installed', 'completed')) as sold_at
     from leads l
     where l.gclid is not null
       and coalesce(l.ad_clicked_at, l.created_at) > now() - make_interval(days => $1)
     order by l.created_at`,
    [ATTRIBUTION_DAYS],
  );

  const csv = conversionsCsv(
    rows.map((row): ConversionRow => ({
      gclid: row.gclid as string,
      createdAt: new Date(row.created_at as string),
      bookedAt: row.booked_at ? new Date(row.booked_at as string) : null,
      soldAt: row.sold_at ? new Date(row.sold_at as string) : null,
      soldCents: (row.sold_cents as number | null) ?? null,
    })),
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="google-ads-conversions.csv"`,
      "cache-control": "no-store",
    },
  });
}

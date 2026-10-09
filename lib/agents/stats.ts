import "server-only";
import { db } from "@/lib/db";
import { BOOKED_OR_LATER, SOLD_OR_LATER } from "@/lib/admin/stages";
import { HEARD_VIA_OPTIONS } from "@/lib/leads/referral";

export const BUSINESS_COUNT_KEYS = ["window_days", "leads", "leads_by_source", "leads_by_heard_via", "ad_click_leads", "referral_leads", "consultations_booked", "sales", "revenue_cents"] as const;
export type BusinessCounts = {
  window_days: number; leads: number; leads_by_source: Record<string, number>; leads_by_heard_via: Record<string, number>;
  ad_click_leads: number; referral_leads: number; consultations_booked: number; sales: number; revenue_cents: number;
};
const KNOWN: ReadonlySet<string> = new Set(HEARD_VIA_OPTIONS);

/** Aggregates for agents. Counts and sums only: heard_via is free text, so anything not a form option becomes "Other". */
export async function businessCounts(days: 7 | 28): Promise<BusinessCounts> {
  const window = `created_at > now() - make_interval(days => $1)`;
  const [totals, bySource, byHeard, outcomes] = await Promise.all([
    db().query(`select count(*) as leads, count(gclid) as ad_click_leads, count(referred_by) as referral_leads from leads where ${window}`, [days]),
    db().query(`select source, count(*) as n from leads where ${window} group by source`, [days]),
    db().query(`select heard_via, count(*) as n from leads where ${window} group by heard_via`, [days]),
    // A booking or sale counts in the window when the lead FIRST reached that stage then
    // (as in conversions-feed.ts), so a job that skipped ahead still counts once.
    db().query(
      `with firsts as (
         select lead_id,
           min(created_at) filter (where to_status = any($2::text[])) as booked_at,
           min(created_at) filter (where to_status = any($3::text[])) as sold_at
         from job_events where kind = 'stage' group by lead_id)
       select count(*) filter (where f.booked_at > now() - make_interval(days => $1)) as booked,
              count(*) filter (where f.sold_at > now() - make_interval(days => $1)) as sales,
              coalesce(sum(l.sold_cents) filter (where f.sold_at > now() - make_interval(days => $1)), 0) as revenue_cents
       from firsts f join leads l on l.id = f.lead_id`,
      [days, [...BOOKED_OR_LATER], [...SOLD_OR_LATER]],
    ),
  ]);
  const heard: Record<string, number> = {};
  for (const row of byHeard) {
    const label = row.heard_via == null || String(row.heard_via).trim() === "" ? "Not answered" : KNOWN.has(String(row.heard_via)) ? String(row.heard_via) : "Other";
    heard[label] = (heard[label] ?? 0) + Number(row.n);
  }
  return {
    window_days: days, leads: Number(totals[0]?.leads ?? 0), ad_click_leads: Number(totals[0]?.ad_click_leads ?? 0),
    referral_leads: Number(totals[0]?.referral_leads ?? 0),
    leads_by_source: Object.fromEntries(bySource.map((r) => [String(r.source), Number(r.n)])),
    leads_by_heard_via: heard,
    consultations_booked: Number(outcomes[0]?.booked ?? 0), sales: Number(outcomes[0]?.sales ?? 0),
    revenue_cents: Number(outcomes[0]?.revenue_cents ?? 0),
  };
}

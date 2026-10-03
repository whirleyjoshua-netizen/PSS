import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";

/** Who the contract sent automatically on approval names: the client's approval sent it, not an owner. */
export const APPROVAL_ACTOR = "Sent on approval";

export type OfferedVersion = { id: string; version: number; option: string; quoteFileId: string | null; approvedAt: Date | null; clientTotalCents: number | null };

const toOffered = (row: Record<string, unknown>): OfferedVersion => ({
  id: row.id as string, version: Number(row.version), option: (row.option as string | null) ?? "A",
  quoteFileId: (row.quote_file_id as string | null) ?? null,
  approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
  clientTotalCents: row.client_total_cents === null || row.client_total_cents === undefined ? null : Number(row.client_total_cents),
});

/** The job's newest offered DC version, or null. Replaced by offeredVersions once its callers move (quote options Task 8). */
export async function offeredVersion(leadId: string): Promise<OfferedVersion | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select id, version, option, quote_file_id, approved_at, client_total_cents from dc_quote_versions
    where lead_id = ${leadId} and status = 'offered'
    order by version desc limit 1`;
  return rows[0] ? toOffered(rows[0] as Record<string, unknown>) : null;
}

/**
 * Every offered DC version of the job, at most one per option (dc_quote_versions_one_offered, per option since
 * migration 040), ordered by option. Approved ones are included: the page shows only those still awaiting the
 * client, and the approve action answers a second tap on an approved one with "approved".
 */
export async function offeredVersions(leadId: string): Promise<OfferedVersion[]> {
  if (!isUuid(leadId)) return [];
  const rows = await db()`
    select id, version, option, quote_file_id, approved_at, client_total_cents from dc_quote_versions
    where lead_id = ${leadId} and status = 'offered'
    order by option, version desc`;
  return rows.map((row) => toOffered(row as Record<string, unknown>));
}

/**
 * Spec §2, the client's approval of a DC quote. One statement: stamps approved_at once (a second approval
 * matches nothing and answers null), only on this job's offered version whose quote PDF is shared and only while
 * the job is not Lost. Quote options spec §6: in the same statement every OTHER option's draft or offered version
 * is superseded and its quote PDF unshared (never one tied to a signature, as Send quote does), and the job's
 * quote_cents becomes the approved total. That leads update also moves Quoted to Approved with a 'stage' event, or
 * — for a change to a job already past Quoted — leaves the stage alone and logs a 'quote' event. One update of the
 * job, never two: two CTEs updating the same row in one statement would apply only one. `moved` says which, from
 * the same statement, so the owners' email never claims a move that did not happen.
 */
export async function approveDcQuote(leadId: string, versionId: string, actor: string): Promise<{ version: number; option: string; moved: boolean } | null> {
  if (!isUuid(leadId) || !isUuid(versionId)) return null;
  const rows = await db()`
    with approved as (
      update dc_quote_versions set approved_at = now(), approved_by = ${actor}
      where id = ${versionId} and lead_id = ${leadId} and status = 'offered' and approved_at is null
        and exists (select 1 from leads where id = ${leadId} and status <> 'lost')
        and exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)
      returning id, version, option, po_reference, client_total_cents
    ),
    closed as (
      update dc_quote_versions set status = 'superseded'
      where lead_id = ${leadId} and status in ('draft','offered') and option <> (select option from approved)
      returning quote_file_id
    ),
    unshared as (
      update job_files set shared_at = null
      where lead_id = ${leadId} and id in (select quote_file_id from closed)
        and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)
      returning id
    ),
    prev as (select status from leads where id = ${leadId}),
    updated as (
      update leads set quote_cents = (select client_total_cents from approved),
        status = case when status = 'quoted' then 'approved' else status end,
        stage_changed_at = case when status = 'quoted' then now() else stage_changed_at end,
        updated_at = now()
      where id = ${leadId} and exists (select 1 from approved)
      returning id
    ),
    moved as (select 1 from prev, updated where prev.status = 'quoted'),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select ${leadId}, ${actor}, 'stage', prev.status, 'approved',
        case when approved.option = 'A' then 'Approved quote version ' || approved.version else 'Approved ' || approved.po_reference || ' version ' || approved.version end
      from prev, moved, approved
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select ${leadId}, ${actor}, 'quote',
        case when approved.option = 'A' then 'Approved quote version ' || approved.version else 'Approved ' || approved.po_reference || ' version ' || approved.version end || ' from their project page'
      from approved
      where not exists (select 1 from moved)
    )
    select version, option, exists (select 1 from moved) as moved from approved`;
  return rows[0] ? { version: Number(rows[0].version), option: (rows[0].option as string | null) ?? "A", moved: rows[0].moved === true } : null;
}

import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";

/** Who the contract sent automatically on approval names: the client's approval sent it, not an owner. */
export const APPROVAL_ACTOR = "Sent on approval";

export type OfferedVersion = { id: string; version: number; quoteFileId: string | null; approvedAt: Date | null };

/** The job's one offered DC version (dc_quote_versions_one_offered allows at most one), or null. */
export async function offeredVersion(leadId: string): Promise<OfferedVersion | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select id, version, quote_file_id, approved_at from dc_quote_versions
    where lead_id = ${leadId} and status = 'offered'
    order by version desc limit 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string, version: Number(row.version), quoteFileId: (row.quote_file_id as string | null) ?? null,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
  };
}

/**
 * Spec §2, the client's approval of a DC quote. One statement: stamps approved_at once (a second
 * approval matches nothing and answers null), only on this job's offered version whose quote PDF is
 * shared and only while the job is not Lost; moves Quoted to Approved with a 'stage' event, or — for a
 * change to a job already past Quoted — logs a 'quote' event and leaves the stage alone. `moved` says
 * which, from the same statement, so the owners' email never claims a move that did not happen.
 */
export async function approveDcQuote(leadId: string, versionId: string, actor: string): Promise<{ version: number; moved: boolean } | null> {
  if (!isUuid(leadId) || !isUuid(versionId)) return null;
  const rows = await db()`
    with approved as (
      update dc_quote_versions set approved_at = now(), approved_by = ${actor}
      where id = ${versionId} and lead_id = ${leadId} and status = 'offered' and approved_at is null
        and exists (select 1 from leads where id = ${leadId} and status <> 'lost')
        and exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)
      returning id, version
    ),
    prev as (select status from leads where id = ${leadId}),
    moved as (
      update leads set status = 'approved', stage_changed_at = now(), updated_at = now()
      where id = ${leadId} and status = 'quoted' and exists (select 1 from approved)
      returning id
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select ${leadId}, ${actor}, 'stage', prev.status, 'approved', 'Approved quote version ' || approved.version
      from prev, moved, approved
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select ${leadId}, ${actor}, 'quote', 'Approved quote version ' || version || ' from their project page' from approved
      where not exists (select 1 from moved)
    )
    select version, exists (select 1 from moved) as moved from approved`;
  return rows[0] ? { version: Number(rows[0].version), moved: rows[0].moved === true } : null;
}

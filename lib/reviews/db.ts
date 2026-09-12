import "server-only";
import { db } from "@/lib/db";
import { JOB_COLUMNS, isUuid, toJob, type Job } from "@/lib/admin/jobs";

/**
 * A coarse database filter. The exact Las Vegas date window is applied by
 * isDueForReview, which is tested apart from SQL.
 */
export async function listReviewCandidates(): Promise<Job[]> {
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where status = 'installed' and email is not null
       and review_requested_at is null and not review_opt_out
       and coalesce(install_on, stage_changed_at::date) >= current_date - 16`,
  );
  return rows.map(toJob);
}

/** Marks the job as being sent. Only one caller can win, so a job never gets two emails. */
export async function claimReview(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    update leads set review_requested_at = now()
    where id = ${id} and review_requested_at is null
    returning id`;
  return rows.length > 0;
}

export async function releaseReview(id: string): Promise<void> {
  if (!isUuid(id)) return;
  await db()`update leads set review_requested_at = null where id = ${id}`;
}

/** Stamps the send and logs it in one statement. */
export async function recordReviewSent(id: string, actor: string): Promise<void> {
  if (!isUuid(id)) return;
  await db()`
    with sent as (
      update leads set review_requested_at = now(), updated_at = now()
      where id = ${id} returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'email', 'Review request sent' from sent`;
}

export async function setReviewOptOut(id: string, optOut: boolean, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const body = optOut ? "Turned off the review request" : "Turned the review request back on";
  const rows = await db()`
    with changed as (
      update leads set review_opt_out = ${optOut}, updated_at = now()
      where id = ${id} returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'edit', ${body} from changed
    returning id`;
  return rows.length > 0;
}

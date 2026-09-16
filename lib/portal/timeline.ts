import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { isStage, type Stage } from "@/lib/admin/stages";

/**
 * The first time each status was reached, for the customer's step dates.
 *
 * job_events also holds the owners' internal notes in its `body` column, so this query
 * selects the status and the time and nothing else. No body column may appear here — a
 * test asserts it on the statement itself. Nothing else about events reaches the portal.
 */
export async function stageDates(jobId: string): Promise<Partial<Record<Stage, Date>>> {
  if (!isUuid(jobId)) return {};
  const rows = await db()`
    select to_status, created_at from job_events
    where lead_id = ${jobId} and kind = 'stage' and to_status is not null
    order by created_at`;

  const dates: Partial<Record<Stage, Date>> = {};
  for (const row of rows) {
    const status = row.to_status;
    // Oldest first, so the first row for a status is the one that counts. Retired
    // statuses that old entries still mention are skipped.
    if (isStage(status) && !dates[status]) dates[status] = new Date(row.created_at as string | Date);
  }
  return dates;
}

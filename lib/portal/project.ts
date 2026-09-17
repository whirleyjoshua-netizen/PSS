import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";

/** How many jobs this customer's referral link has brought in. No reward status. */
export async function countReferred(jobId: string): Promise<number> {
  const [{ count }] = await db()`select count(*)::int as count from leads where referred_by = ${jobId}`;
  return Number(count);
}

/**
 * Every service the customer has requested against this job, newest first, for the lines under
 * the after-work section. A customer who reported a second broken blind in March must still see
 * the one they reported in January — a single "last requested" line would quietly drop it.
 *
 * The date and the project number and nothing else: a service job is a job, and none of the
 * rest of its row belongs on the customer's page.
 */
export async function listServiceRequests(jobId: string): Promise<{ at: Date; projectNo: number | null }[]> {
  if (!isUuid(jobId)) return [];
  const rows = await db()`
    select created_at, project_no from leads
    where parent_job_id = ${jobId}
    order by created_at desc`;
  return rows.map((row) => ({
    at: new Date(row.created_at as string | Date),
    projectNo: (row.project_no as number | null) ?? null,
  }));
}

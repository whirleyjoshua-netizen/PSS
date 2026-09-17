import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";

/** How many jobs this customer's referral link has brought in. No reward status. */
export async function countReferred(jobId: string): Promise<number> {
  const [{ count }] = await db()`select count(*)::int as count from leads where referred_by = ${jobId}`;
  return Number(count);
}

/**
 * When this job last had a service requested against it, for the line under the after-work
 * section. The time and nothing else: a service job is a job, and none of the rest of its row
 * belongs on the customer's page.
 */
export async function lastServiceRequestAt(jobId: string): Promise<Date | null> {
  if (!isUuid(jobId)) return null;
  const rows = await db()`select max(created_at) as at from leads where parent_job_id = ${jobId}`;
  const at = rows[0]?.at as string | Date | null | undefined;
  return at ? new Date(at) : null;
}

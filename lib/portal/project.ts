import "server-only";
import { db } from "@/lib/db";

/** How many jobs this customer's referral link has brought in. No reward status. */
export async function countReferred(jobId: string): Promise<number> {
  const [{ count }] = await db()`select count(*)::int as count from leads where referred_by = ${jobId}`;
  return Number(count);
}

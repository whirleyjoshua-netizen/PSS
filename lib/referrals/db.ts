import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { Stage } from "@/lib/admin/stages";
import { newReferralCode, normalizeCode, rewardStatus, type RewardStatus } from "./codes";

const UNIQUE_VIOLATION = "23505";

/** The job's code, created on first use. Null if the job does not exist. */
export async function ensureReferralCode(id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = await sql`select referral_code from leads where id = ${id}`;
  if (!rows[0]) return null;
  if (rows[0].referral_code) return rows[0].referral_code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = newReferralCode();
      const set = await sql`
        update leads set referral_code = ${code}, updated_at = now()
        where id = ${id} and referral_code is null
        returning referral_code`;
      if (set[0]) return set[0].referral_code as string;
      // Another request gave this job a code first; use that one.
      const again = await sql`select referral_code from leads where id = ${id}`;
      return (again[0]?.referral_code as string | undefined) ?? null;
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
    }
  }
  throw new Error("Could not create a unique referral code");
}

export async function findReferrer(
  input: string,
): Promise<{ id: string; code: string; firstName: string } | null> {
  const code = normalizeCode(input);
  if (!code) return null;
  const rows = await db()`select id, referral_code, name from leads where referral_code = ${code}`;
  if (!rows[0]) return null;
  return {
    id: rows[0].id as string,
    code: rows[0].referral_code as string,
    firstName: (rows[0].name as string).trim().split(/\s+/)[0],
  };
}

export type Referral = {
  id: string;
  name: string;
  status: Stage;
  referralPaidAt: Date | null;
  reward: RewardStatus;
};

export async function listReferrals(referrerId: string): Promise<Referral[]> {
  if (!isUuid(referrerId)) return [];
  const rows = await db()`
    select id, name, status, referral_paid_at from leads
    where referred_by = ${referrerId} order by created_at`;
  return rows.map((row) => {
    const job = {
      status: row.status as Stage,
      referralPaidAt: row.referral_paid_at ? new Date(row.referral_paid_at as string) : null,
    };
    return { id: row.id as string, name: row.name as string, ...job, reward: rewardStatus(job) };
  });
}

/**
 * Marks the reward for a referred job paid, and logs it on the referrer's job.
 * Refuses (returns false) unless the job is installed, unpaid, and referred.
 */
export async function markReferralPaid(referredId: string, actor: string): Promise<boolean> {
  if (!isUuid(referredId)) return false;
  const rows = await db()`
    with paid as (
      update leads set referral_paid_at = now(), updated_at = now()
      where id = ${referredId} and status = 'installed'
        and referral_paid_at is null and referred_by is not null
      returning referred_by, name
    )
    insert into job_events (lead_id, actor, kind, body)
    select referred_by, ${actor}, 'reward', 'Referral reward paid for ' || name from paid
    returning id`;
  return rows.length > 0;
}

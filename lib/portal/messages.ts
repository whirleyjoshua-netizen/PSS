import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { MESSAGE_MAX } from "./message-limits";

export { MESSAGE_MAX };

/** One minute between messages: enough to swallow a double-click, short enough not to annoy. */
const THROTTLE_SECONDS = 60;

export type MessageResult = "sent" | "throttled" | "too-long" | "empty" | "not-found";

/**
 * Records one customer message against their job.
 *
 * This function does NOT check ownership — it trusts the caller. Every caller must first
 * re-derive the customer's own jobs from the session and refuse anything else, which is
 * what sendCustomerMessage does.
 */
export async function sendMessage(jobId: string, body: string, actor: string): Promise<MessageResult> {
  const text = body.trim();
  // A blank message is a quiet no-op, not an error: the textarea is required, so this is
  // only reachable with JavaScript off or a crafted post, and doing nothing is correct.
  if (!text) return "empty";
  if (text.length > MESSAGE_MAX) return "too-long";
  if (!isUuid(jobId)) return "not-found";

  const sql = db();
  const [recent] = await sql`
    select created_at from job_events
    where lead_id = ${jobId} and kind = 'message'
    order by created_at desc limit 1`;
  if (recent && Date.now() - new Date(recent.created_at as string | Date).getTime() < THROTTLE_SECONDS * 1000) {
    return "throttled";
  }

  // The row is written here, before any email is sent, so a Resend failure can never lose
  // the customer's words. The caller sends the notification only after this resolves.
  const rows = await sql`
    insert into job_events (lead_id, actor, kind, body)
    values (${jobId}, ${actor}, 'message', ${text})
    returning id`;
  return rows.length > 0 ? "sent" : "not-found";
}

/** The customer's own messages on their own job, newest first. */
export async function listMessages(jobId: string): Promise<{ body: string; createdAt: Date }[]> {
  if (!isUuid(jobId)) return [];
  const rows = await db()`
    select body, created_at from job_events
    where lead_id = ${jobId} and kind = 'message'
    order by created_at desc`;
  return rows.map((row) => ({
    body: String(row.body ?? ""),
    createdAt: new Date(row.created_at as string | Date),
  }));
}

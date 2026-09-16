import "server-only";
import { db } from "@/lib/db";
import { MESSAGE_MAX } from "./message-limits";

export { MESSAGE_MAX };

/** One minute between messages: enough to swallow a double-click, short enough not to annoy. */
const THROTTLE_SECONDS = 60;

export type MessageResult = "sent" | "throttled" | "too-long" | "empty" | "not-found";
/** What sendMessage itself can answer. Ownership — and so "not-found" — belongs to the caller. */
export type SendOutcome = Exclude<MessageResult, "not-found">;

/**
 * Records one customer message against their job.
 *
 * This function does NOT check ownership — it trusts the caller. Every caller must first
 * re-derive the customer's own jobs from the session and refuse anything else, which is
 * what sendCustomerMessage does.
 *
 * The throttle and the insert are one statement on purpose. As a read followed by a write
 * they were not atomic: two concurrent sends could both see an empty window and both
 * insert. Here the database decides, and `insert ... select ... where not exists` writes
 * nothing when a recent message already exists — so no rows returned means throttled.
 *
 * Both halves are scoped to `actor` as well as the job, so what the customer may send is
 * measured only against what the customer themselves sent. An owner-authored event on the
 * same job can never throttle them.
 *
 * Every parameter is cast where its type could be inferred rather than stated. The window
 * is built as text and cast with `::interval`, which is how lib/portal/login.ts and
 * lib/admin/login.ts already bind a duration — the one style in this repo, and one that
 * runs in production on every login email. The actor and body sit in a SELECT list, where
 * Postgres infers from the insert target instead of binding straight from a VALUES row, so
 * they say `::text` rather than relying on that inference.
 */
export async function sendMessage(jobId: string, body: string, actor: string): Promise<SendOutcome> {
  const text = body.trim();
  // A blank message is a quiet no-op, not an error: the textarea is required, so this is
  // only reachable with JavaScript off or a crafted post, and doing nothing is correct.
  if (!text) return "empty";
  if (text.length > MESSAGE_MAX) return "too-long";

  const rows = await db()`
    insert into job_events (lead_id, actor, kind, body)
    select ${jobId}::uuid, ${actor}::text, 'message', ${text}::text
    where not exists (
      select 1 from job_events
      where lead_id = ${jobId}::uuid and actor = ${actor} and kind = 'message'
        and created_at > now() - ${`${THROTTLE_SECONDS} seconds`}::interval
    )
    returning id`;
  return rows.length > 0 ? "sent" : "throttled";
}

/**
 * The customer's own messages on their own job, newest first.
 *
 * Scoped to `actor`, not just to kind = 'message'. These bodies render on the customer's
 * page, so which rows qualify is settled by the query rather than by the convention that
 * nothing else writes that kind today.
 */
export async function listMessages(
  jobId: string,
  actor: string,
): Promise<{ body: string; createdAt: Date }[]> {
  const rows = await db()`
    select body, created_at from job_events
    where lead_id = ${jobId}::uuid and actor = ${actor} and kind = 'message'
    order by created_at desc`;
  return rows.map((row) => ({
    body: String(row.body ?? ""),
    createdAt: new Date(row.created_at as string | Date),
  }));
}

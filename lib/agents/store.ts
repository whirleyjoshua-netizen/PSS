import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";
import { normalizeAddress, type Agent, type AgentItem, type ItemStatus, type PushItem } from "./rules";

/** Rows for migration 044. Unit tests pin this SQL's text. scripts/verify-agents.ts runs it on a real database. */

const date = (v: unknown) => (v ? new Date(v as string) : null);
const ITEM_COLUMNS = `id, agent_slug, external_id, kind, title, summary, report_type, body_md, email_to, email_subject, email_body,
  reason, status, owner_note, final_to, final_subject, final_body, sent_body, decided_by, decided_at, sent_at, conversation_id,
  error, created_at, updated_at`;

export function toItem(r: Record<string, unknown>): AgentItem {
  return {
    id: r.id as string, agentSlug: r.agent_slug as string, externalId: r.external_id as string, kind: r.kind as AgentItem["kind"],
    title: r.title as string, summary: (r.summary as string | null) ?? null, reportType: (r.report_type as string | null) ?? null,
    bodyMd: (r.body_md as string | null) ?? null, emailTo: (r.email_to as string | null) ?? null,
    emailSubject: (r.email_subject as string | null) ?? null, emailBody: (r.email_body as string | null) ?? null,
    reason: (r.reason as string | null) ?? null, status: r.status as ItemStatus, ownerNote: (r.owner_note as string | null) ?? null,
    finalTo: (r.final_to as string | null) ?? null, finalSubject: (r.final_subject as string | null) ?? null,
    finalBody: (r.final_body as string | null) ?? null, sentBody: (r.sent_body as string | null) ?? null,
    decidedBy: (r.decided_by as string | null) ?? null, decidedAt: date(r.decided_at), sentAt: date(r.sent_at),
    conversationId: (r.conversation_id as string | null) ?? null, error: (r.error as string | null) ?? null,
    createdAt: new Date(r.created_at as string), updatedAt: new Date(r.updated_at as string),
  };
}
function toAgent(r: Record<string, unknown>): Agent {
  return {
    slug: r.slug as string, name: r.name as string, role: r.role as string, hasKey: r.key_hash != null,
    statsAccess: Boolean(r.stats_access), dailySendCap: Number(r.daily_send_cap), lastRunAt: date(r.last_run_at),
    lastRunStatus: (r.last_run_status as Agent["lastRunStatus"]) ?? null, lastRunNote: (r.last_run_note as string | null) ?? null,
  };
}

export async function findAgentByKeyHash(hash: string): Promise<Agent | null> {
  const [row] = await db()`select * from agents where key_hash = ${hash}`;
  return row ? toAgent(row) : null;
}
export async function getAgent(slug: string): Promise<Agent | null> {
  const [row] = await db()`select * from agents where slug = ${slug}`;
  return row ? toAgent(row) : null;
}
export async function createAgent(input: { slug: string; name: string; role: string; statsAccess: boolean; dailySendCap: number }): Promise<boolean> {
  const rows = await db()`
    insert into agents (slug, name, role, stats_access, daily_send_cap)
    values (${input.slug}, ${input.name}, ${input.role}, ${input.statsAccess}, ${input.dailySendCap})
    on conflict (slug) do nothing returning slug`;
  return rows.length > 0;
}
export async function setAgentKeyHash(slug: string, hash: string): Promise<boolean> {
  return (await db()`update agents set key_hash = ${hash} where slug = ${slug} returning slug`).length > 0;
}
export async function recordRun(slug: string, status: "ok" | "failed", note: string | null): Promise<void> {
  await db()`update agents set last_run_at = now(), last_run_status = ${status}, last_run_note = ${note} where slug = ${slug}`;
}

export async function upsertItem(slug: string, item: PushItem): Promise<"created" | "updated" | "locked"> {
  const status = item.kind === "report" ? "unread" : "pending";
  const body = item.kind === "email" ? null : (item.body_md ?? null);
  const reportType = item.kind === "report" ? item.report_type : null;
  const [to, subject, emailBody] = item.kind === "email" ? [item.email_to, item.email_subject, item.email_body] : [null, null, null];
  const rows = await db()`
    insert into agent_items (agent_slug, external_id, kind, title, summary, report_type, body_md, email_to, email_subject, email_body, reason, status)
    values (${slug}, ${item.external_id}, ${item.kind}, ${item.title}, ${item.summary ?? null}, ${reportType}, ${body},
            ${to}, ${subject}, ${emailBody}, ${item.reason ?? null}, ${status})
    on conflict (agent_slug, external_id) do update set
      title = excluded.title, summary = excluded.summary, report_type = excluded.report_type, body_md = excluded.body_md,
      email_to = excluded.email_to, email_subject = excluded.email_subject, email_body = excluded.email_body,
      reason = excluded.reason, updated_at = now()
    where agent_items.status in ('unread', 'pending') and agent_items.kind = excluded.kind
    returning (xmax = 0) as created`;
  if (rows.length === 0) return "locked";
  return rows[0].created ? "created" : "updated";
}

export async function listNeedsYou(): Promise<AgentItem[]> {
  const rows = await db().query(
    `select ${ITEM_COLUMNS} from agent_items where kind in ('email', 'decision') and status in ('pending', 'failed') order by created_at`,
  );
  return rows.map(toItem);
}
export async function listItems(slug: string, reportType?: string): Promise<AgentItem[]> {
  const rows = await db().query(
    `select ${ITEM_COLUMNS} from agent_items where agent_slug = $1 and ($2::text is null or report_type = $2) order by created_at desc limit 200`,
    [slug, reportType ?? null],
  );
  return rows.map(toItem);
}
export async function getItem(id: string): Promise<AgentItem | null> {
  if (!isUuid(id)) return null;
  const [row] = await db().query(`select ${ITEM_COLUMNS} from agent_items where id = $1`, [id]);
  return row ? toItem(row) : null;
}
export async function markRead(id: string): Promise<void> {
  await db()`update agent_items set status = 'read', updated_at = now() where id = ${id} and status = 'unread'`;
}
export async function saveEmailEdits(id: string, edits: { to: string; subject: string; body: string }): Promise<boolean> {
  const rows = await db()`
    update agent_items set final_to = ${edits.to}, final_subject = ${edits.subject}, final_body = ${edits.body}, updated_at = now()
    where id = ${id} and kind = 'email' and status in ('pending', 'failed') returning id`;
  return rows.length > 0;
}
export async function decideItem(id: string, input: { status: "approved" | "declined" | "answered"; note: string | null; by: string }): Promise<boolean> {
  const rows = await db()`
    update agent_items set status = ${input.status}, owner_note = ${input.note}, decided_by = ${input.by}, decided_at = now(),
      delivered_at = null, updated_at = now()
    where id = ${id} and status = 'pending' and (kind = 'decision' or ${input.status} = 'declined') returning id`;
  return rows.length > 0;
}
export async function claimForSend(id: string, by: string): Promise<AgentItem | null> {
  const rows = await db()`
    update agent_items set status = 'approved', final_to = coalesce(final_to, email_to),
      final_subject = coalesce(final_subject, email_subject), final_body = coalesce(final_body, email_body),
      decided_by = ${by}, decided_at = now(), error = null, delivered_at = null, updated_at = now()
    where id = ${id} and kind = 'email' and status in ('pending', 'failed')
    returning *`;
  return rows[0] ? toItem(rows[0]) : null;
}
export async function markSent(id: string, sent: { sentBody: string; graphMessageId: string; conversationId: string; internetMessageId: string }): Promise<void> {
  await db()`
    update agent_items set status = 'sent', sent_body = ${sent.sentBody}, graph_message_id = ${sent.graphMessageId},
      conversation_id = ${sent.conversationId}, internet_message_id = ${sent.internetMessageId}, sent_at = now(),
      delivered_at = null, updated_at = now()
    where id = ${id}`;
}
export async function markFailed(id: string, error: string): Promise<void> {
  await db()`update agent_items set status = 'failed', error = ${error.slice(0, 500)}, delivered_at = null, updated_at = now() where id = ${id}`;
}
export async function sentTodayCount(slug: string, laDate: string): Promise<number> {
  const [row] = await db()`
    select count(*)::int as n from agent_items
    where agent_slug = ${slug} and status = 'sent' and (sent_at at time zone 'America/Los_Angeles')::date = ${laDate}::date`;
  return Number(row?.n ?? 0);
}
export async function pullUpdates(slug: string): Promise<AgentItem[]> {
  const rows = await db()`
    update agent_items set delivered_at = now() where agent_slug = ${slug} and delivered_at is null and status not in ('unread', 'read', 'pending')
    returning *`;
  return rows.map(toItem);
}

export type ReplyOut = { external_id: string; from: string; received_at: string; subject: string | null; body_text: string };
export async function insertReply(r: { itemId: string; internetMessageId: string; from: string; receivedAt: Date; subject: string | null; bodyText: string }): Promise<boolean> {
  const rows = await db()`
    insert into agent_replies (item_id, internet_message_id, from_address, received_at, subject, body_text)
    values (${r.itemId}, ${r.internetMessageId}, ${normalizeAddress(r.from)}, ${r.receivedAt.toISOString()}, ${r.subject}, ${r.bodyText})
    on conflict (internet_message_id) do nothing returning id`;
  return rows.length > 0;
}
export async function pullReplies(slug: string): Promise<ReplyOut[]> {
  const rows = await db()`
    update agent_replies r set delivered_at = now()
    from agent_items i where r.item_id = i.id and i.agent_slug = ${slug} and r.delivered_at is null
    returning i.external_id, r.from_address, r.received_at, r.subject, r.body_text`;
  return rows.map((r) => ({
    external_id: r.external_id as string, from: r.from_address as string, received_at: new Date(r.received_at as string).toISOString(),
    subject: (r.subject as string | null) ?? null, body_text: r.body_text as string,
  }));
}
export type RecentReply = { id: string; itemId: string; agentSlug: string; itemTitle: string; from: string; receivedAt: Date; subject: string | null; bodyText: string; seen: boolean };
export async function listRecentReplies(limit: number): Promise<RecentReply[]> {
  const rows = await db()`
    select r.id, r.item_id, i.agent_slug, i.title, r.from_address, r.received_at, r.subject, r.body_text, r.seen_at
    from agent_replies r join agent_items i on i.id = r.item_id order by r.received_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id as string, itemId: r.item_id as string, agentSlug: r.agent_slug as string, itemTitle: r.title as string,
    from: r.from_address as string, receivedAt: new Date(r.received_at as string), subject: (r.subject as string | null) ?? null,
    bodyText: r.body_text as string, seen: r.seen_at != null,
  }));
}
export type ItemReply = { from: string; receivedAt: Date; subject: string | null; bodyText: string };
export async function listRepliesForItem(id: string): Promise<ItemReply[]> {
  if (!isUuid(id)) return [];
  const rows = await db()`select from_address, received_at, subject, body_text from agent_replies where item_id = ${id} order by received_at`;
  return rows.map((r) => ({
    from: r.from_address as string, receivedAt: new Date(r.received_at as string),
    subject: (r.subject as string | null) ?? null, bodyText: r.body_text as string,
  }));
}
export async function markRepliesSeen(): Promise<void> {
  await db()`update agent_replies set seen_at = now() where seen_at is null`;
}
export async function sentConversations(days: number): Promise<{ id: string; conversationId: string }[]> {
  const rows = await db()`
    select id, conversation_id from agent_items
    where status = 'sent' and conversation_id is not null and sent_at > now() - make_interval(days => ${days})`;
  return rows.map((r) => ({ id: r.id as string, conversationId: r.conversation_id as string }));
}

export async function isSuppressed(address: string): Promise<boolean> {
  return (await db()`select 1 from email_suppressions where address = ${normalizeAddress(address)}`).length > 0;
}
export async function addSuppression(address: string, reason: string | null, source: "reply" | "owner"): Promise<void> {
  await db()`insert into email_suppressions (address, reason, source) values (${normalizeAddress(address)}, ${reason}, ${source}) on conflict (address) do nothing`;
}
export async function removeSuppression(address: string): Promise<void> {
  await db()`delete from email_suppressions where address = ${normalizeAddress(address)}`;
}
export async function listSuppressions(): Promise<{ address: string; reason: string | null; source: string; createdAt: Date }[]> {
  const rows = await db()`select address, reason, source, created_at from email_suppressions order by created_at desc`;
  return rows.map((r) => ({ address: r.address as string, reason: (r.reason as string | null) ?? null, source: r.source as string, createdAt: new Date(r.created_at as string) }));
}

export async function getAgentSettings(): Promise<{ mailingAddress: string | null; signature: string | null; lastDigestAt: Date | null }> {
  const [r] = await db()`select mailing_address, signature, last_digest_at from agent_settings where id`;
  return { mailingAddress: (r?.mailing_address as string | null) ?? null, signature: (r?.signature as string | null) ?? null, lastDigestAt: date(r?.last_digest_at) };
}
export async function saveAgentSettings(input: { mailingAddress: string; signature: string; by: string }): Promise<void> {
  await db()`
    update agent_settings set mailing_address = ${input.mailingAddress || null}, signature = ${input.signature || null},
      updated_by = ${input.by}, updated_at = now() where id`;
}
export async function claimReplyPoll(): Promise<boolean> {
  const rows = await db()`
    update agent_settings set last_reply_poll_at = now()
    where id and (last_reply_poll_at is null or last_reply_poll_at < now() - interval '2 minutes') returning id`;
  return rows.length > 0;
}
export async function setDigestAt(at: Date): Promise<void> {
  await db()`update agent_settings set last_digest_at = ${at.toISOString()} where id`;
}
export async function needsYouCount(): Promise<number> {
  const [r] = await db()`
    select (select count(*) from agent_items where kind in ('email', 'decision') and status in ('pending', 'failed'))
         + (select count(*) from agent_replies where seen_at is null) as n`;
  return Number(r?.n ?? 0);
}

export type AgentCard = Agent & {
  pending: number; unreadReports: number;
  newestReport: { id: string; title: string; summary: string | null; status: ItemStatus; createdAt: Date } | null;
};
export async function listAgentCards(): Promise<AgentCard[]> {
  const rows = await db()`
    select a.*,
      (select count(*)::int from agent_items i where i.agent_slug = a.slug and i.kind in ('email', 'decision') and i.status in ('pending', 'failed')) as pending,
      (select count(*)::int from agent_items i where i.agent_slug = a.slug and i.kind = 'report' and i.status = 'unread') as unread_reports,
      r.id as report_id, r.title as report_title, r.summary as report_summary, r.status as report_status, r.created_at as report_created_at
    from agents a
    left join lateral (
      select id, title, summary, status, created_at from agent_items where agent_slug = a.slug and kind = 'report' order by created_at desc limit 1
    ) r on true
    order by a.name`;
  return rows.map((row) => ({
    ...toAgent(row), pending: Number(row.pending), unreadReports: Number(row.unread_reports),
    newestReport: row.report_id
      ? { id: row.report_id as string, title: row.report_title as string, summary: (row.report_summary as string | null) ?? null,
          status: row.report_status as ItemStatus, createdAt: new Date(row.report_created_at as string) }
      : null,
  }));
}

export type DigestFacts = { newReports: { agentSlug: string; agentName: string; title: string }[]; pending: number; newReplies: number; failedRuns: { agentName: string; note: string | null }[] };
export async function digestFacts(since: Date | null): Promise<DigestFacts> {
  const from = (since ?? new Date(0)).toISOString();
  const [reports, pending, replies, failed] = await Promise.all([
    db()`select i.agent_slug, a.name, i.title from agent_items i join agents a on a.slug = i.agent_slug
         where i.kind = 'report' and i.created_at > ${from} order by a.name, i.created_at`,
    db()`select count(*)::int as n from agent_items where kind in ('email', 'decision') and status in ('pending', 'failed')`,
    db()`select count(*)::int as n from agent_replies where created_at > ${from}`,
    db()`select name, last_run_note from agents where last_run_status = 'failed' and last_run_at > ${from}`,
  ]);
  return {
    newReports: reports.map((r) => ({ agentSlug: r.agent_slug as string, agentName: r.name as string, title: r.title as string })),
    pending: Number(pending[0]?.n ?? 0), newReplies: Number(replies[0]?.n ?? 0),
    failedRuns: failed.map((r) => ({ agentName: r.name as string, note: (r.last_run_note as string | null) ?? null })),
  };
}

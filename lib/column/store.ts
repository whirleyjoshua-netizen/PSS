import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { normalizeAddress } from "@/lib/agents/rules";
import { columnEventBody, type ColumnEvent } from "./rules";

/**
 * Column (the team's work app) connects with one key, kept here as its sha256. It can read leads and the
 * do-not-contact list, get unsubscribe links for the emails it sends, and log its calls and emails on a lead's
 * timeline. It can't change anything else.
 */
export type ColumnKey = { createdBy: string; createdAt: Date; lastUsedAt: Date | null };
export type LeadRow = {
  id: string; name: string; email: string | null; phone: string; address: string | null; city: string; source: string;
  stage: string; lostReason: string | null; assignedTo: string | null; suppressed: boolean;
  createdAt: Date; updatedAt: Date | null; stageChangedAt: Date | null;
};

const date = (v: unknown): Date | null => (v ? new Date(v as string) : null);

/** True for Column's current key, which is then marked used. */
export async function columnKeyMatches(hash: string): Promise<boolean> {
  const rows = await db()`update integration_keys set last_used_at = now() where name = 'column' and key_hash = ${hash} returning name`;
  return rows.length > 0;
}
export async function getColumnKey(): Promise<ColumnKey | null> {
  const [row] = await db()`select created_by, created_at, last_used_at from integration_keys where name = 'column'`;
  return row ? { createdBy: row.created_by as string, createdAt: new Date(row.created_at as string), lastUsedAt: date(row.last_used_at) } : null;
}
/** A new key replaces the old one at once, so the old key stops working. */
export async function setColumnKey(hash: string, by: string): Promise<void> {
  await db()`
    insert into integration_keys (name, key_hash, created_by) values ('column', ${hash}, ${by})
    on conflict (name) do update set key_hash = excluded.key_hash, created_by = excluded.created_by, created_at = now(), last_used_at = null`;
}
export async function deleteColumnKey(): Promise<void> {
  await db()`delete from integration_keys where name = 'column'`;
}

/** Leads in id order, `limit` at a time after the id `after`. Each says whether its email is on the do-not-contact list. */
export async function listLeadsPage(after: string | null, limit: number): Promise<LeadRow[]> {
  const rows = await db()`
    select l.id, l.name, l.email, l.phone, l.address, l.city, l.source, l.status, l.lost_reason, l.created_at, l.updated_at,
           l.stage_changed_at, t.name as assigned_name, (s.address is not null) as suppressed
    from leads l
    left join team_members t on t.id = l.assigned_to
    left join email_suppressions s on s.address = lower(btrim(l.email))
    where ${after}::uuid is null or l.id > ${after}::uuid
    order by l.id
    limit ${limit}`;
  return rows.map((r) => ({
    id: r.id as string, name: r.name as string, email: (r.email as string | null) ?? null, phone: r.phone as string,
    address: (r.address as string | null) ?? null, city: r.city as string, source: r.source as string, stage: r.status as string,
    lostReason: (r.lost_reason as string | null) ?? null, assignedTo: (r.assigned_name as string | null) ?? null,
    suppressed: !!r.suppressed, createdAt: new Date(r.created_at as string), updatedAt: date(r.updated_at), stageChangedAt: date(r.stage_changed_at),
  }));
}

export async function suppressedAddresses(): Promise<string[]> {
  const rows = await db()`select address from email_suppressions order by address`;
  return rows.map((r) => r.address as string);
}

/** Each address's unsubscribe token, made the first time it's asked for. */
export async function unsubscribeTokens(addresses: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(addresses.map(normalizeAddress))];
  if (!unique.length) return new Map();
  const tokens = unique.map(() => randomBytes(24).toString("base64url"));
  await db()`
    insert into email_unsubscribe_links (token, address)
    select * from unnest(${tokens}::text[], ${unique}::text[])
    on conflict (address) do nothing`;
  const rows = await db()`select token, address from email_unsubscribe_links where address = any(${unique}::text[])`;
  return new Map(rows.map((r) => [r.address as string, r.token as string]));
}
export async function addressForToken(token: string): Promise<string | null> {
  const [row] = await db()`select address from email_unsubscribe_links where token = ${token}`;
  return row ? (row.address as string) : null;
}

/**
 * Logs one of Column's calls or emails on its lead's timeline, as a contact. A call also moves a New lead to
 * Contacted, as logging a contact on the job page does; a campaign email doesn't, so one mailing can't move
 * every New lead at once. A repeat of the same Column id logs nothing. "missing" when the lead is gone.
 */
export async function addColumnEvent(e: ColumnEvent): Promise<"saved" | "missing"> {
  const actor = `${e.by} (Column)`;
  const at = new Date(Math.min(Date.parse(e.at), Date.now()));
  const move = e.method === "call";
  const [row] = await db()`
    with logged as (
      insert into job_events (lead_id, actor, kind, body, created_at, column_id)
      select id, ${actor}, 'contact', ${columnEventBody(e)}, ${at}::timestamptz, ${e.id} from leads where id = ${e.lead_id}
      on conflict (column_id) where column_id is not null do nothing
      returning lead_id
    ), moved as (
      update leads set status = 'contacted', stage_changed_at = now(), updated_at = now()
      where ${move}::boolean and id = ${e.lead_id} and status = 'new' and exists (select 1 from logged)
      returning id
    ), stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status)
      select moved.id, ${actor}, 'stage', 'new', 'contacted' from moved
    )
    select exists (select 1 from leads where id = ${e.lead_id}) as found`;
  return row?.found ? "saved" : "missing";
}

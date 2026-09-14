import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { Stage } from "@/lib/admin/stages";
import type { EventJob, Kind } from "./events";

export type CalendarJob = EventJob & { status: Stage; visitAt: Date | null; installOn: string | null };
/** eventId starts with "pending:" while a sync holds the claim to create that event (see claimLink). */
export type Link = { leadId: string; kind: Kind; eventId: string; changeKey: string; syncedAt?: Date };

const toLink = (row: Record<string, unknown>): Link => ({
  leadId: row.lead_id as string, kind: row.kind as Kind,
  eventId: row.event_id as string, changeKey: row.change_key as string,
  ...(row.synced_at ? { syncedAt: new Date(row.synced_at as string) } : {}),
});

export async function getCalendarJob(leadId: string): Promise<CalendarJob | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select id, name, phone, email, address, city, treatments, status, visit_at, install_on::text as install_on
    from leads where id = ${leadId}`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string, name: row.name as string, phone: row.phone as string,
    email: (row.email as string | null) ?? null, address: (row.address as string | null) ?? null,
    city: row.city as string, treatments: (row.treatments as string[]) ?? [],
    status: row.status as Stage,
    visitAt: row.visit_at ? new Date(row.visit_at as string) : null,
    installOn: (row.install_on as string | null) ?? null,
  };
}

export async function getLinks(leadId: string): Promise<Link[]> {
  const rows = await db()`
    select lead_id, kind, event_id, change_key, synced_at from job_calendar_events where lead_id = ${leadId}`;
  return rows.map(toLink);
}

export async function getLinkByEvent(eventId: string): Promise<Link | null> {
  const rows = await db()`select lead_id, kind, event_id, change_key from job_calendar_events where event_id = ${eventId}`;
  return rows[0] ? toLink(rows[0]) : null;
}

export async function saveLink(link: Link): Promise<void> {
  await db()`
    insert into job_calendar_events (lead_id, kind, event_id, change_key, synced_at)
    values (${link.leadId}, ${link.kind}, ${link.eventId}, ${link.changeKey}, now())
    on conflict (lead_id, kind) do update
      set event_id = excluded.event_id, change_key = excluded.change_key, synced_at = now()`;
}

/**
 * Claims the right to create one job date's Outlook event, so two syncs running at once never both create it.
 * True when this call inserted the placeholder row; false when a link (real or claimed) already exists.
 */
export async function claimLink(leadId: string, kind: Kind): Promise<boolean> {
  const rows = await db()`
    insert into job_calendar_events (lead_id, kind, event_id, change_key, synced_at)
    values (${leadId}, ${kind}, 'pending:' || gen_random_uuid(), '', now())
    on conflict (lead_id, kind) do nothing returning 1`;
  return rows.length > 0;
}

export async function deleteLink(leadId: string, kind: Kind): Promise<void> {
  await db()`delete from job_calendar_events where lead_id = ${leadId} and kind = ${kind}`;
}

/** Changes a job date from Outlook and logs it, in one statement. */
export async function setJobDate(leadId: string, kind: Kind, value: Date | string | null, note: string): Promise<void> {
  if (kind === "visit") {
    await db()`
      with changed as (update leads set visit_at = ${value}, updated_at = now() where id = ${leadId} returning id)
      insert into job_events (lead_id, actor, kind, body) select id, ${"Outlook"}, ${"edit"}, ${note} from changed`;
  } else {
    await db()`
      with changed as (update leads set install_on = ${value}::date, updated_at = now() where id = ${leadId} returning id)
      insert into job_events (lead_id, actor, kind, body) select id, ${"Outlook"}, ${"edit"}, ${note} from changed`;
  }
}

export async function recordError(message: string): Promise<void> {
  await db()`update calendar_sync_state set last_error = ${message.slice(0, 500)}, last_error_at = now(), updated_at = now() where id = 1`;
}

export async function clearError(): Promise<void> {
  await db()`update calendar_sync_state set last_error = null, last_error_at = null, updated_at = now() where id = 1`;
}

export async function getSyncState() {
  const rows = await db()`select subscription_id, expires_at, last_error, last_error_at from calendar_sync_state where id = 1`;
  const row = rows[0] ?? {};
  return {
    subscriptionId: (row.subscription_id as string | null) ?? null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    lastError: (row.last_error as string | null) ?? null,
    lastErrorAt: row.last_error_at ? new Date(row.last_error_at as string) : null,
  };
}

export async function saveSubscription(id: string | null, expiresAt: Date | null): Promise<void> {
  await db()`
    insert into calendar_sync_state (id, subscription_id, expires_at, updated_at) values (1, ${id}, ${expiresAt}, now())
    on conflict (id) do update set subscription_id = excluded.subscription_id, expires_at = excluded.expires_at, updated_at = now()`;
}

export async function reconcileTargets(): Promise<string[]> {
  const rows = await db()`
    select id from leads
     where status <> 'lost'
       and (visit_at >= now() - interval '30 days' or install_on >= current_date - 30)
    union
    select lead_id as id from job_calendar_events`;
  return rows.map((row) => row.id as string);
}

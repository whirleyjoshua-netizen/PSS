import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { mirrorToJob } from "@/lib/admin/appointments";
import type { Stage } from "@/lib/admin/stages";
import type { EventJob, Kind } from "./events";

/** A confirmed appointment, the only kind that reaches Outlook. Its notes go into its event's body. */
export type JobAppointment = { kind: Kind; startsAt: Date; allDay: boolean; designerNotes: string | null };
export type CalendarJob = EventJob & {
  status: Stage; visitAt: Date | null; installOn: string | null; appointments: JobAppointment[];
};
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
    select id, name, phone, email, address, city, treatments, gate_code, status, visit_at, install_on::text as install_on
    from leads where id = ${leadId}`;
  const row = rows[0];
  if (!row) return null;
  // Unconfirmed appointments are invisible to Outlook, so they are never read back here.
  const appointments = await db()`
    select kind, starts_at, all_day, designer_notes from appointments
    where lead_id = ${leadId} and confirmed_at is not null order by starts_at`;
  return {
    id: row.id as string, name: row.name as string, phone: row.phone as string,
    email: (row.email as string | null) ?? null, address: (row.address as string | null) ?? null,
    city: row.city as string, treatments: (row.treatments as string[]) ?? [],
    gateCode: (row.gate_code as string | null) ?? null,
    status: row.status as Stage,
    visitAt: row.visit_at ? new Date(row.visit_at as string) : null,
    installOn: (row.install_on as string | null) ?? null,
    appointments: appointments.map((a) => ({
      kind: a.kind as Kind,
      startsAt: new Date(a.starts_at as string | Date),
      allDay: a.all_day === true,
      designerNotes: (a.designer_notes as string | null) ?? null,
    })),
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
 * Returns this claim's pending event id when this call inserted the placeholder row; null when a link
 * (real or claimed) already exists.
 */
export async function claimLink(leadId: string, kind: Kind): Promise<string | null> {
  const rows = await db()`
    insert into job_calendar_events (lead_id, kind, event_id, change_key, synced_at)
    values (${leadId}, ${kind}, 'pending:' || gen_random_uuid(), '', now())
    on conflict (lead_id, kind) do nothing returning event_id`;
  return rows[0] ? (rows[0].event_id as string) : null;
}

/**
 * Removes a job date's link. With an eventId, removes it only while it still holds that event,
 * so a sync never drops a link (or claim) another sync wrote in the meantime.
 */
export async function deleteLink(leadId: string, kind: Kind, eventId?: string): Promise<void> {
  if (eventId === undefined) {
    await db()`delete from job_calendar_events where lead_id = ${leadId} and kind = ${kind}`;
  } else {
    await db()`delete from job_calendar_events where lead_id = ${leadId} and kind = ${kind} and event_id = ${eventId}`;
  }
}

/**
 * Applies an Outlook edit to the APPOINTMENT row and logs it, then refreshes the mirrors. The
 * appointment is the record and leads.visit_at / leads.install_on follow from it, so the next mirror
 * cannot undo what someone changed in Outlook. An already-confirmed appointment stays confirmed:
 * moving an event in Outlook is not a re-booking, so it never sends the job back for confirmation.
 */
export async function setJobDate(leadId: string, kind: Kind, value: Date | string | null, note: string): Promise<void> {
  if (value === null) {
    await db()`
      with gone as (delete from appointments where lead_id = ${leadId} and kind = ${kind} returning lead_id)
      insert into job_events (lead_id, actor, kind, body) select lead_id, ${"Outlook"}, ${"edit"}, ${note} from gone`;
  } else if (typeof value === "string") {
    // An all-day appointment is kept at Las Vegas midnight on its date.
    await db()`
      with changed as (
        update appointments
           set starts_at = (${value}::text || ' 00:00')::timestamp at time zone 'America/Los_Angeles', updated_at = now()
         where lead_id = ${leadId} and kind = ${kind} returning lead_id)
      insert into job_events (lead_id, actor, kind, body) select lead_id, ${"Outlook"}, ${"edit"}, ${note} from changed`;
  } else {
    await db()`
      with changed as (
        update appointments set starts_at = ${value}::timestamptz, updated_at = now()
         where lead_id = ${leadId} and kind = ${kind} returning lead_id)
      insert into job_events (lead_id, actor, kind, body) select lead_id, ${"Outlook"}, ${"edit"}, ${note} from changed`;
  }
  await mirrorToJob(leadId);
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

/**
 * The daily catch-up's jobs: every recently dated open job, every job with a recent appointment, plus
 * linked jobs whose event may need removing — the job is lost, or the confirmed appointment behind the
 * link is gone. A link whose appointment is still there but long past is left alone, which keeps the
 * daily work bounded.
 */
export async function reconcileTargets(): Promise<string[]> {
  const rows = await db()`
    select id from leads
     where status <> 'lost'
       and (visit_at >= now() - interval '30 days' or install_on >= current_date - 30)
    union
    select a.lead_id as id from appointments a join leads l on l.id = a.lead_id
     where a.confirmed_at is not null and l.status <> 'lost'
       and a.starts_at >= now() - interval '30 days'
    union
    select e.lead_id as id from job_calendar_events e join leads l on l.id = e.lead_id
     where l.status = 'lost'
        or not exists (
              select 1 from appointments a
               where a.lead_id = e.lead_id and a.kind = e.kind and a.confirmed_at is not null)`;
  return rows.map((row) => row.id as string);
}

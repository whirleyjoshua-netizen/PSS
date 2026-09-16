import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "./jobs";
import { formatShortDate, formatWhen } from "./time";
import { kindLabel, type AppointmentKind } from "./appointment-kinds";

// This module must never import from lib/calendar: lib/calendar/store.ts depends on mirrorToJob,
// so the dependency stays one-way.

export type Appointment = {
  id: string;
  jobId: string;
  kind: AppointmentKind;
  startsAt: Date;
  allDay: boolean;
  confirmedAt: Date | null;
  confirmedBy: string | null;
};

function toAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: row.id as string,
    jobId: row.lead_id as string,
    kind: row.kind as AppointmentKind,
    startsAt: new Date(row.starts_at as string | Date),
    allDay: row.all_day === true,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string | Date) : null,
    confirmedBy: (row.confirmed_by as string | null) ?? null,
  };
}

/** An all-day appointment is described by its date; a timed one by its Las Vegas day and time. */
const whenLabel = (startsAt: Date, allDay: boolean): string =>
  allDay ? formatShortDate(startsAt) : formatWhen(startsAt);

export async function listAppointments(jobId: string): Promise<Appointment[]> {
  if (!isUuid(jobId)) return [];
  const rows = await db()`
    select id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by from appointments
    where lead_id = ${jobId} order by starts_at`;
  return rows.map(toAppointment);
}

export type SaveResult = "ok" | "missing";

/**
 * Books or moves one appointment and logs it, in one statement. A saved appointment is always
 * unconfirmed: only the confirm path sets confirmed_at, and only a confirmed row mirrors to the job.
 */
export async function saveAppointment(
  jobId: string, kind: AppointmentKind, startsAt: Date, allDay: boolean, actor: string,
): Promise<SaveResult> {
  if (!isUuid(jobId)) return "missing";
  const when = whenLabel(startsAt, allDay);
  const setBody = `${kindLabel(kind)} set for ${when} — pending confirmation`;
  const movedBody = `${kindLabel(kind)} moved to ${when} — pending confirmation`;
  const [result] = await db()`
    with target as (select id from leads where id = ${jobId}),
    prev as (select id from appointments where lead_id = ${jobId} and kind = ${kind}),
    saved as (
      insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
      select id, ${kind}, ${startsAt}::timestamptz, ${allDay}::boolean, null, null from target
      on conflict (lead_id, kind) do update set
        starts_at = excluded.starts_at, all_day = excluded.all_day,
        confirmed_at = null, confirmed_by = null, updated_at = now()
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select ${jobId}, ${actor}, 'edit',
        case when exists (select 1 from prev) then ${movedBody} else ${setBody} end
      from saved
      returning id
    )
    select (select count(*) from target)::int as job`;
  return result?.job ? "ok" : "missing";
}

export type ConfirmResult = Appointment | "missing" | "already";

/** Stamps who confirmed the appointment. Confirming twice is reported, never re-stamped. */
export async function confirmAppointment(id: string, actor: string): Promise<ConfirmResult> {
  if (!isUuid(id)) return "missing";
  const [result] = await db()`
    with prev as (select id from appointments where id = ${id}),
    confirmed as (
      update appointments set confirmed_at = now(), confirmed_by = ${actor}, updated_at = now()
      where id = ${id} and confirmed_at is null
      returning id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by
    )
    select c.id, c.lead_id, c.kind, c.starts_at, c.all_day, c.confirmed_at, c.confirmed_by,
           (select count(*) from prev)::int as found
    from prev left join confirmed c on true`;
  if (!result) return "missing";
  if (!result.id) return "already";
  return toAppointment(result);
}

/** Removes the appointment and logs it, in one statement. The label comes from initcap(kind). */
export async function cancelAppointment(id: string, actor: string): Promise<Appointment | "missing"> {
  if (!isUuid(id)) return "missing";
  const [result] = await db()`
    with gone as (
      delete from appointments where id = ${id}
      returning id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'edit', initcap(kind) || ' cancelled' from gone
      returning id
    )
    select id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by from gone`;
  return result ? toAppointment(result) : "missing";
}

/**
 * "Consultation confirmed for Sun, Sep 20, 10:00 AM". confirmAppointment only stamps the row; the
 * confirm action logs it, so the log line and the customer's email are written by the same step.
 */
export async function logConfirmation(appointment: Appointment, actor: string): Promise<void> {
  if (!isUuid(appointment.jobId)) return;
  const body = `${kindLabel(appointment.kind)} confirmed for ${whenLabel(appointment.startsAt, appointment.allDay)}`;
  await db()`
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'edit', ${body} from leads where id = ${appointment.jobId}`;
}

/** Records that the confirmation email went out, and to which address. */
export async function logAppointmentEmail(jobId: string, email: string, actor: string): Promise<void> {
  if (!isUuid(jobId)) return;
  await db()`
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'email', ${`Appointment email sent to ${email}`} from leads where id = ${jobId}`;
}

/** The one place leads.visit_at / leads.install_on are maintained: mirrors of the CONFIRMED rows. */
export async function mirrorToJob(jobId: string): Promise<void> {
  if (!isUuid(jobId)) return;
  await db()`
    update leads set
      visit_at = (select a.starts_at from appointments a
                   where a.lead_id = ${jobId} and a.kind = 'consultation' and a.confirmed_at is not null),
      install_on = (select (a.starts_at at time zone 'America/Los_Angeles')::date from appointments a
                     where a.lead_id = ${jobId} and a.kind = 'install' and a.confirmed_at is not null),
      updated_at = now()
    where id = ${jobId}`;
}

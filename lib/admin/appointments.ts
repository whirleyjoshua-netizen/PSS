import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "./jobs";
import { formatShortDate, formatWhen } from "./time";
import { clockOf } from "@/lib/routes/window";
import { kindLabel, type AppointmentKind } from "./appointment-kinds";

// This module must never import from lib/calendar: lib/calendar/store.ts depends on mirrorToJob,
// so the dependency stays one-way.

/** When the crew may arrive ("08:00" to "10:00", or both null for any time) and how long the visit takes. */
export type AppointmentTiming = { windowStart: string | null; windowEnd: string | null; durationMinutes: number | null };

export type Appointment = {
  id: string;
  jobId: string;
  kind: AppointmentKind;
  startsAt: Date;
  allDay: boolean;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  /** The designer's own notes for this visit. Owner-only: never in the portal, emails or job_events. */
  designerNotes: string | null;
} & AppointmentTiming;

/**
 * What a booking or a notes edit writes besides the time. gateCode undefined leaves the client's
 * gate code alone; null clears it. The gate code is per client (leads.gate_code), the notes per appointment.
 */
export type AppointmentDetails = { designerNotes: string | null; gateCode?: string | null };

/**
 * A booking's details. keepNotes leaves an existing row's notes as they are (a new row gets none):
 * a booking that did not come from that appointment's own Reschedule must never wipe its notes.
 */
export type BookingDetails = AppointmentDetails & { keepNotes: boolean };

function toAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: row.id as string,
    jobId: row.lead_id as string,
    kind: row.kind as AppointmentKind,
    startsAt: new Date(row.starts_at as string | Date),
    allDay: row.all_day === true,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string | Date) : null,
    confirmedBy: (row.confirmed_by as string | null) ?? null,
    designerNotes: (row.designer_notes as string | null) ?? null,
    windowStart: clockOf(row.window_start),
    windowEnd: clockOf(row.window_end),
    durationMinutes: typeof row.duration_minutes === "number" ? row.duration_minutes : null,
  };
}

/** An all-day appointment is described by its date; a timed one by its Las Vegas day and time. */
const whenLabel = (startsAt: Date, allDay: boolean): string =>
  allDay ? formatShortDate(startsAt) : formatWhen(startsAt);

export async function listAppointments(jobId: string): Promise<Appointment[]> {
  if (!isUuid(jobId)) return [];
  const rows = await db()`
    select id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by, designer_notes,
           window_start::text as window_start, window_end::text as window_end, duration_minutes
      from appointments
    where lead_id = ${jobId} order by starts_at`;
  return rows.map(toAppointment);
}

export type SaveResult = "ok" | "missing";

/**
 * Books or moves one appointment and logs it, in one statement. A saved appointment is always
 * unconfirmed: only the confirm path sets confirmed_at, and only a confirmed row mirrors to the job.
 * The same statement saves the designer notes (or, with details.keepNotes, keeps the row's own) and,
 * when details.gateCode is given and differs, the client's gate code. Neither goes into the log line.
 */
export async function saveAppointment(
  jobId: string, kind: AppointmentKind, startsAt: Date, allDay: boolean, timing: AppointmentTiming, actor: string,
  details: BookingDetails,
): Promise<SaveResult> {
  if (!isUuid(jobId)) return "missing";
  const when = whenLabel(startsAt, allDay);
  const setBody = `${kindLabel(kind)} set for ${when} — pending confirmation`;
  const movedBody = `${kindLabel(kind)} moved to ${when} — pending confirmation`;
  const setGate = details.gateCode !== undefined;
  const gateCode = details.gateCode ?? null;
  const keepNotes = details.keepNotes;
  const notes = keepNotes ? null : details.designerNotes;
  const [result] = await db()`
    with target as (select id from leads where id = ${jobId}),
    prev as (select id from appointments where lead_id = ${jobId} and kind = ${kind}),
    gate as (
      update leads set gate_code = ${gateCode}::text, updated_at = now()
       where id = ${jobId} and ${setGate}::boolean and gate_code is distinct from ${gateCode}::text
      returning id
    ),
    saved as (
      insert into appointments (lead_id, kind, starts_at, all_day, window_start, window_end, duration_minutes, designer_notes, confirmed_at, confirmed_by)
      select id, ${kind}, ${startsAt}::timestamptz, ${allDay}::boolean,
             ${timing.windowStart}::time, ${timing.windowEnd}::time, ${timing.durationMinutes}::integer,
             ${notes}::text, null, null
        from target
      on conflict (lead_id, kind) do update set
        starts_at = excluded.starts_at, all_day = excluded.all_day,
        designer_notes = case when ${keepNotes}::boolean then appointments.designer_notes else excluded.designer_notes end,
        window_start = excluded.window_start, window_end = excluded.window_end,
        duration_minutes = excluded.duration_minutes,
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

/**
 * Edits one appointment's designer notes, and the client's gate code when details.gateCode is given,
 * in one statement. Unlike saveAppointment it never touches confirmed_at: a notes edit is not a
 * re-booking. It leaves appointments.updated_at alone too, because the route planner reads a newer
 * updated_at as "this day changed" (SAVE_GUARD in lib/routes/day.ts) and notes do not move a route.
 * The log line names the kind only: the notes and the gate code never go into job_events.
 */
export async function setAppointmentNotes(
  jobId: string, appointmentId: string, details: AppointmentDetails, actor: string,
): Promise<SaveResult> {
  if (!isUuid(jobId) || !isUuid(appointmentId)) return "missing";
  const setGate = details.gateCode !== undefined;
  const gateCode = details.gateCode ?? null;
  const [result] = await db()`
    with noted as (
      update appointments set designer_notes = ${details.designerNotes}::text
       where id = ${appointmentId} and lead_id = ${jobId}
      returning lead_id, kind
    ),
    gate as (
      update leads set gate_code = ${gateCode}::text, updated_at = now()
       where id = (select lead_id from noted) and ${setGate}::boolean and gate_code is distinct from ${gateCode}::text
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'edit', initcap(kind) || ' notes updated' from noted
      returning id
    )
    select (select count(*) from noted)::int as found`;
  return result?.found ? "ok" : "missing";
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
      returning id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by,
                window_start::text as window_start, window_end::text as window_end, duration_minutes
    )
    select c.id, c.lead_id, c.kind, c.starts_at, c.all_day, c.confirmed_at, c.confirmed_by,
           c.window_start, c.window_end, c.duration_minutes,
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
      returning id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by,
                window_start::text as window_start, window_end::text as window_end, duration_minutes
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'edit', initcap(kind) || ' cancelled' from gone
      returning id
    )
    select id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by, window_start, window_end, duration_minutes
      from gone`;
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

/**
 * Why a confirmed customer was never told. The confirm action returns this to the card as well, but
 * the owner may never look at the card, so the job's Activity is where it has to survive.
 */
export async function logAppointmentProblem(jobId: string, body: string, actor: string): Promise<void> {
  if (!isUuid(jobId)) return;
  await db()`
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'email', ${body} from leads where id = ${jobId}`;
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

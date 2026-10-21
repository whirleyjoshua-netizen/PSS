import "server-only";
import { db } from "@/lib/db";
import { fromLocalInput, formatWhen, lasVegasDate } from "@/lib/admin/time";
import { mirrorToJob, type Appointment } from "@/lib/admin/appointments";
import { setStage } from "@/lib/admin/jobs";
import { hashToken } from "@/lib/admin/tokens";
import { calendarConfig } from "@/lib/calendar/config";
import { graphJson } from "@/lib/calendar/graph";
import { BOOKING, candidateDays, isCandidate, isOpen, openDays, type Busy, type SlotDay } from "./slots";

type OutlookEvent = {
  isAllDay?: boolean;
  showAs?: string;
  start: { dateTime: string };
  end: { dateTime: string };
};

const nextDate = (ymd: string): string =>
  new Date(new Date(`${ymd}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/**
 * What the support@ calendar has taken between two instants. A timed event blocks unless it is
 * marked Free or Working elsewhere. An all-day event blocks only when marked Away (out of office):
 * the tracker puts installs on the calendar as all-day events, and those must not close the day.
 * Throws when Outlook is not connected or cannot be read, so nothing is offered blind.
 */
async function outlookBusy(from: Date, to: Date): Promise<Busy[]> {
  const config = calendarConfig();
  if (!config) throw new Error("Outlook isn't connected");
  const events: OutlookEvent[] = [];
  let next: string | undefined =
    `users/${config.mailbox}/calendar/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}` +
    "&$select=start,end,isAllDay,showAs&$top=200";
  for (let page = 0; page < 10 && next; page++) {
    const result: { value: OutlookEvent[]; "@odata.nextLink"?: string } = await graphJson(next);
    events.push(...result.value);
    next = result["@odata.nextLink"];
  }
  return events
    .filter((event) => (event.isAllDay ? event.showAs === "oof" : event.showAs !== "free" && event.showAs !== "workingElsewhere"))
    .map((event) => ({
      // The Prefer header in graphFetch returns Las Vegas wall time.
      start: fromLocalInput(event.start.dateTime.slice(0, 16)),
      end: fromLocalInput(event.end.dateTime.slice(0, 16)),
    }));
}

/**
 * The tracker's own timed appointments, pending ones included, for their real length: Outlook shows
 * a booked visit as one hour, and an unconfirmed one not at all.
 */
async function trackerBusy(from: Date, to: Date): Promise<Busy[]> {
  const rows = await db()`
    select starts_at, starts_at + make_interval(mins => coalesce(duration_minutes, 60)) as ends_at
      from appointments
     where not all_day and starts_at < ${to} and starts_at + make_interval(mins => coalesce(duration_minutes, 60)) > ${from}`;
  return rows.map((row) => ({ start: new Date(row.starts_at as string), end: new Date(row.ends_at as string) }));
}

async function busyBetween(from: Date, to: Date): Promise<Busy[]> {
  const [outlook, tracker] = await Promise.all([outlookBusy(from, to), trackerBusy(from, to)]);
  return [...outlook, ...tracker];
}

/** Midnight before the first offered day to midnight after the last, in Las Vegas time. */
function range(days: SlotDay[]): { from: Date; to: Date } {
  return {
    from: fromLocalInput(`${days[0].date}T00:00`),
    to: fromLocalInput(`${nextDate(days[days.length - 1].date)}T00:00`),
  };
}

/** The open consultation times from tomorrow through the booking horizon. Throws when Outlook can't be read. */
export async function availableDays(now = new Date()): Promise<SlotDay[]> {
  const { from, to } = range(candidateDays(now));
  return openDays(now, await busyBetween(from, to));
}

export type BookResult = { status: "booked"; appointment: Appointment } | { status: "taken" };

/**
 * Books the lead's consultation at `start`, confirmed, as the owner's Confirm would: it mirrors to the
 * job and moves a new lead to Appointment booked. The caller syncs Outlook and emails the customer.
 * "taken" when `start` is not an offered time or is no longer free. The insert re-checks the tracker in
 * the same statement, so two visitors racing for one time can't both get it.
 */
export async function bookConsultation(leadId: string, start: Date, now = new Date()): Promise<BookResult> {
  if (!isCandidate(start, now)) return { status: "taken" };
  const day = lasVegasDate(start);
  const busy = await busyBetween(fromLocalInput(`${day}T00:00`), fromLocalInput(`${nextDate(day)}T00:00`));
  if (!isOpen(start, busy)) return { status: "taken" };

  const visitEnd = new Date(start.getTime() + BOOKING.visitMinutes * 60_000);
  const blockEnd = new Date(visitEnd.getTime() + BOOKING.driveMinutes * 60_000);
  const body = `Consultation booked online for ${formatWhen(start)}`;
  const [row] = await db()`
    with saved as (
      insert into appointments (lead_id, kind, starts_at, all_day, duration_minutes, confirmed_at, confirmed_by)
      select id, 'consultation', ${start}::timestamptz, false, ${BOOKING.visitMinutes}::integer, now(), 'website'
        from leads
       where id = ${leadId}
         and not exists (
           select 1 from appointments a
            where not a.all_day
              and a.starts_at < ${blockEnd}::timestamptz
              and a.starts_at + make_interval(mins => coalesce(a.duration_minutes, 60) + ${BOOKING.driveMinutes}::integer) > ${start}::timestamptz)
      on conflict (lead_id, kind) do nothing
      returning id, lead_id, starts_at, confirmed_at
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, 'customer', 'edit', ${body} from saved
      returning id
    )
    select id, lead_id, starts_at, confirmed_at from saved`;
  if (!row) return { status: "taken" };

  await mirrorToJob(leadId);
  await setStage(leadId, "visit_booked", "customer", { body: "Booked a consultation online" });
  return {
    status: "booked",
    appointment: {
      id: row.id as string, jobId: leadId, kind: "consultation",
      startsAt: new Date(row.starts_at as string), allDay: false,
      confirmedAt: new Date(row.confirmed_at as string), confirmedBy: "website", designerNotes: null,
      windowStart: null, windowEnd: null, durationMinutes: BOOKING.visitMinutes,
    },
  };
}

/** The confirmed consultation behind a live thank-you key, for the thank-you page. Null when there is none. */
export async function findBookedVisit(key: string | undefined): Promise<Date | null> {
  if (!key) return null;
  const rows = await db()`
    select a.starts_at
      from leads l join appointments a on a.lead_id = l.id and a.kind = 'consultation' and a.confirmed_at is not null
     where l.questionnaire_token_hash = ${hashToken(key)} and l.questionnaire_expires_at > now()`;
  return rows[0] ? new Date(rows[0].starts_at as string) : null;
}

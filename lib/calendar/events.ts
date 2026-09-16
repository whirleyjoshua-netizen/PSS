import { fromLocalInput, toLocalInput } from "@/lib/admin/time";
import { kindLabel, type AppointmentKind } from "@/lib/admin/appointment-kinds";

/** One Outlook event per appointment kind; the kinds are the appointment kinds. */
export type Kind = AppointmentKind;
type GraphTime = { dateTime: string; timeZone: string };
export type GraphEvent = {
  id: string;
  changeKey: string;
  subject?: string;
  isAllDay?: boolean;
  start: GraphTime;
  end: GraphTime;
  type?: string;
  seriesMasterId?: string | null;
};
export type EventJob = {
  id: string; name: string; phone: string; email: string | null;
  address: string | null; city: string; treatments: string[];
};

const ZONE = "Pacific Standard Time"; // Windows zone name Graph uses for Las Vegas, DST included
const HOUR = 3_600_000;

const local = (instant: Date): GraphTime => ({ dateTime: `${toLocalInput(instant)}:00`, timeZone: ZONE });
const midnight = (date: string): GraphTime => ({ dateTime: `${date}T00:00:00`, timeZone: ZONE });

/** The calendar day after YYYY-MM-DD. Noon UTC keeps the arithmetic clear of any zone. */
export function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Graph's "2026-09-20T10:00:00.0000000" (already in Las Vegas time) as an instant. */
const instantOf = (time: GraphTime): Date => fromLocalInput(time.dateTime.slice(0, 16));

const formatPhone = (digits: string) =>
  digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;

/** The Graph request body for a new job event. */
export type EventBody = {
  subject: string;
  isAllDay: boolean;
  start: GraphTime;
  end: GraphTime;
  location: { displayName: string };
  body: { contentType: "text"; content: string };
};

/**
 * The one wording for an event's subject. The reconcile compares against it to spot an event left
 * under older wording, so it must come from here and never be re-typed there.
 */
export const eventSubject = (kind: Kind, job: { name: string }): string => `${kindLabel(kind)} · ${job.name}`;

/**
 * The Graph body for a new appointment's event. `allDay` decides the shape — a whole day, or one
 * hour from `value` — so any kind can be booked either way; the kind only names it.
 */
export function newEventBody(
  kind: Kind, job: EventJob, value: Date | string, jobUrl: string, allDay: boolean,
): EventBody {
  const lines = [
    `Phone: ${formatPhone(job.phone)}`,
    job.email ? `Email: ${job.email}` : null,
    job.treatments.length ? `Interested in: ${job.treatments.join(", ")}` : null,
    "",
    `Open the job: ${jobUrl}`,
  ].filter((line) => line !== null);
  const timing = allDay
    ? { isAllDay: true, start: midnight(value as string), end: midnight(nextDay(value as string)) }
    : { isAllDay: false, start: local(value as Date), end: local(new Date((value as Date).getTime() + HOUR)) };
  return {
    subject: eventSubject(kind, job),
    ...timing,
    location: { displayName: job.address ? `${job.address}, ${job.city}` : job.city },
    body: { contentType: "text", content: lines.join("\n") },
  };
}

/** New start and end for a date moved in the tracker. A timed one keeps its current length in Outlook. */
export function movedTimes(
  allDay: boolean, value: Date | string, current: GraphEvent,
): { isAllDay: boolean; start: GraphTime; end: GraphTime } {
  // isAllDay is always sent, so an event someone changed in Outlook comes back to the right shape.
  if (allDay) {
    return { isAllDay: true, start: midnight(value as string), end: midnight(nextDay(value as string)) };
  }
  const length = current.isAllDay ? 0 : instantOf(current.end).getTime() - instantOf(current.start).getTime();
  const start = value as Date;
  return { isAllDay: false, start: local(start), end: local(new Date(start.getTime() + (length > 0 ? length : HOUR))) };
}

/** The value an Outlook event implies: a date for an all-day appointment, otherwise an instant. */
export function trackerValue(allDay: boolean, event: GraphEvent): Date | string {
  return allDay ? event.start.dateTime.slice(0, 10) : instantOf(event.start);
}

export function sameValue(allDay: boolean, a: Date | string | null, b: Date | string | null): boolean {
  if (a === null || b === null) return a === b;
  if (allDay) return a === b;
  return Math.floor((a as Date).getTime() / 60_000) === Math.floor((b as Date).getTime() / 60_000);
}

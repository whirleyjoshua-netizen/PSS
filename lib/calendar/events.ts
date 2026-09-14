import { fromLocalInput, toLocalInput } from "@/lib/admin/time";

export type Kind = "visit" | "install";
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

export function newEventBody(kind: Kind, job: EventJob, value: Date | string, jobUrl: string): object {
  const lines = [
    `Phone: ${formatPhone(job.phone)}`,
    job.email ? `Email: ${job.email}` : null,
    job.treatments.length ? `Interested in: ${job.treatments.join(", ")}` : null,
    "",
    `Open the job: ${jobUrl}`,
  ].filter((line) => line !== null);
  const timing =
    kind === "visit"
      ? { isAllDay: false, start: local(value as Date), end: local(new Date((value as Date).getTime() + HOUR)) }
      : { isAllDay: true, start: midnight(value as string), end: midnight(nextDay(value as string)) };
  return {
    subject: `${kind === "visit" ? "Visit" : "Install"} · ${job.name}`,
    ...timing,
    location: { displayName: job.address ? `${job.address}, ${job.city}` : job.city },
    body: { contentType: "text", content: lines.join("\n") },
  };
}

/** New start and end for a date moved in the tracker. A visit keeps its current length in Outlook. */
export function movedTimes(kind: Kind, value: Date | string, current: GraphEvent): { start: GraphTime; end: GraphTime } {
  if (kind === "install") return { start: midnight(value as string), end: midnight(nextDay(value as string)) };
  const length = instantOf(current.end).getTime() - instantOf(current.start).getTime();
  const start = value as Date;
  return { start: local(start), end: local(new Date(start.getTime() + (length > 0 ? length : HOUR))) };
}

/** The tracker value an Outlook event implies: an instant for a visit, a date for an install. */
export function trackerValue(kind: Kind, event: GraphEvent): Date | string {
  return kind === "visit" ? instantOf(event.start) : event.start.dateTime.slice(0, 10);
}

export function sameValue(kind: Kind, a: Date | string | null, b: Date | string | null): boolean {
  if (a === null || b === null) return a === b;
  if (kind === "install") return a === b;
  return Math.floor((a as Date).getTime() / 60_000) === Math.floor((b as Date).getTime() / 60_000);
}

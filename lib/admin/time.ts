/** Las Vegas shares Pacific time, including daylight saving. */
const ZONE = "America/Los_Angeles";

/** Minutes the zone is behind UTC at `date`: 420 in summer, 480 in winter. */
function offsetMinutes(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")!.value; // e.g. "GMT-7"
  const [, sign, hours, minutes = "0"] = name.match(/GMT([+-])(\d+)(?::(\d+))?/)!;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? total : -total;
}

/** A `datetime-local` value typed in Las Vegas, as an instant. */
export function fromLocalInput(value: string): Date {
  const asUtc = new Date(`${value}:00Z`);
  const first = new Date(asUtc.getTime() + offsetMinutes(asUtc) * 60_000);
  // Re-check at the resolved instant so times near a DST switch land correctly.
  return new Date(asUtc.getTime() + offsetMinutes(first) * 60_000);
}

export function toLocalInput(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export const formatWhen = (date: Date): string =>
  date.toLocaleString("en-US", {
    timeZone: ZONE, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });

/** The Las Vegas calendar date of an instant, as YYYY-MM-DD. */
export const lasVegasDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/** "Sun, Sep 13, 2026" in Las Vegas time, for the board header. */
export const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** "Tue 9/15" in Las Vegas time, for the last-contacted line. */
export function formatShortDay(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "numeric", day: "numeric" })
      .formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${p.weekday} ${p.month}/${p.day}`;
}

/** "Wed 10/14, 2:00 PM" in Las Vegas time, for the call log line. */
export function formatCallVisit(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${p.weekday} ${p.month}/${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

const DAY_MS = 86_400_000;
/** Noon UTC on a YYYY-MM-DD date, so date arithmetic never crosses a day boundary. */
const noonUtc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

/** "Sep 11, 2026" in Las Vegas time. */
export const formatShortDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { timeZone: ZONE, month: "short", day: "numeric", year: "numeric" });

/** A date-only column value ("2026-10-12") as "Oct 12, 2026", with no time-zone shift. */
export const formatDateOnly = (ymd: string): string =>
  noonUtc(ymd).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/** "10:31 AM" in Las Vegas time. */
export const formatTime = (date: Date): string =>
  date.toLocaleTimeString("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });

/** Whole Las Vegas calendar days from `from` to `now`; never negative. */
export const daysBetween = (from: Date, now: Date): number =>
  Math.max(0, Math.round((noonUtc(lasVegasDate(now)).getTime() - noonUtc(lasVegasDate(from)).getTime()) / DAY_MS));

/** "Today", "Yesterday", "Sep 11", or "Dec 30, 2025" when not this year. */
export function dayLabel(date: Date, now: Date): string {
  const days = daysBetween(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = lasVegasDate(date).slice(0, 4) === lasVegasDate(now).slice(0, 4);
  return date.toLocaleDateString("en-US", {
    timeZone: ZONE, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

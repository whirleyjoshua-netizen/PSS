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

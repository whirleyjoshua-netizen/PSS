import { lasVegasDate } from "@/lib/admin/time";

const ZONE = "America/Los_Angeles";

/** "9:00 AM" in Las Vegas time. */
export const formatTime = (date: Date): string =>
  date.toLocaleTimeString("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });

/** "Fri 9:00 AM" in Las Vegas time. */
const withDay = (date: Date): string =>
  `${date.toLocaleDateString("en-US", { timeZone: ZONE, weekday: "short" })} ${formatTime(date)}`;

/** Whether a timed event starts and ends on `day` (YYYY-MM-DD). An end at midnight belongs to the day before. */
function onDay(start: Date, end: Date, day: string): { starts: boolean; ends: boolean } {
  const last = end > start ? new Date(end.getTime() - 1) : start;
  return { starts: lasVegasDate(start) === day, ends: lasVegasDate(last) === day };
}

/**
 * "9:00 AM – 10:00 AM" for an event within `day`. An endpoint on another day carries its weekday, so a copy
 * of a multi-day event reads "9:00 AM – Sun 10:00 AM", "Fri 9:00 AM – Sun 10:00 AM" or "Fri 9:00 AM – 10:00 AM".
 */
export function spanLabel(start: Date, end: Date, day: string): string {
  const { starts, ends } = onDay(start, end, day);
  return `${starts ? formatTime(start) : withDay(start)} – ${ends ? formatTime(end) : withDay(end)}`;
}

/**
 * The short time for a narrow month-grid cell: "All day", the start time on the day an event starts,
 * or "Continues" on a later day of a multi-day event.
 */
export function cellWhen(item: { allDay: boolean; start: Date | null; end: Date | null }, day: string): string {
  if (item.allDay || !item.start) return "All day";
  return lasVegasDate(item.start) === day ? formatTime(item.start) : "Continues";
}

/** The compact time for a schedule card: the start alone within one day, else the dated span. */
export function whenLabel(start: Date, end: Date | null | undefined, day: string): string {
  if (!end) return formatTime(start);
  const { starts, ends } = onDay(start, end, day);
  return starts && ends ? formatTime(start) : spanLabel(start, end, day);
}

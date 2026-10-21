import { formatTime } from "@/lib/admin/time";
import type { SlotDay } from "./slots";

/** One offered day as the pop-up shows it. `start` is the slot's instant as ISO, which the form sends back. */
export type SlotDayView = { date: string; weekday: string; day: string; slots: { start: string; label: string }[] };

const noonUtc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

export const slotDays = (days: SlotDay[]): SlotDayView[] =>
  days.map((day) => ({
    date: day.date,
    weekday: noonUtc(day.date).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }),
    day: noonUtc(day.date).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }),
    slots: day.slots.map((slot) => ({ start: slot.toISOString(), label: formatTime(slot) })),
  }));

/** "Thursday, October 22 at 10:00 AM" in Las Vegas time, for the form and the thank-you page. */
export const visitLabel = (start: Date): string =>
  `${start.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric" })} at ${formatTime(start)}`;

/** One cell of the pop-up's calendar: a Monday-to-Saturday date, open when it has times left. */
export type CalendarCell = { date: string; dayNumber: number; label: string; open: boolean };

const addDays = (ymd: string, days: number): string =>
  new Date(noonUtc(ymd).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The offered days as a small Monday-to-Saturday calendar (no Sundays: we don't book them), from the week of the
 * first open day to the week of the last, so the pop-up never scrolls sideways (owner 2026-10-21).
 */
export function calendarWeeks(days: SlotDayView[]): { title: string; weeks: CalendarCell[][] } {
  if (days.length === 0) return { title: "", weeks: [] };
  const open = new Set(days.map((day) => day.date));
  const first = days[0].date;
  const last = days[days.length - 1].date;
  // getUTCDay: 0 is Sunday, so Monday is 1 day back from Tuesday, 6 back from Sunday.
  let monday = addDays(first, -((noonUtc(first).getUTCDay() + 6) % 7));
  const weeks: CalendarCell[][] = [];
  while (monday <= last) {
    weeks.push(Array.from({ length: 6 }, (_, i) => {
      const date = addDays(monday, i);
      return {
        date,
        dayNumber: noonUtc(date).getUTCDate(),
        label: noonUtc(date).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }),
        open: open.has(date),
      };
    }));
    monday = addDays(monday, 7);
  }
  const month = (ymd: string) => noonUtc(ymd).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
  const year = noonUtc(last).getUTCFullYear();
  const title = month(first) === month(last) ? `${month(first)} ${year}` : `${month(first)} – ${month(last)} ${year}`;
  return { title, weeks };
}

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

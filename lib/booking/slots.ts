import { fromLocalInput, lasVegasDate } from "@/lib/admin/time";

/**
 * Online booking rules (owner 2026-10-20, hours 2026-10-21): Monday to Saturday, noon to 6 PM Las Vegas time,
 * from tomorrow up to two weeks out. A consultation is 90 minutes plus 30 minutes to drive,
 * so each one needs a free two-hour block that ends by closing.
 */
export const BOOKING = {
  openHour: 12,
  closeHour: 18,
  visitMinutes: 90,
  driveMinutes: 30,
  horizonDays: 14,
} as const;

const MINUTE = 60_000;
const BLOCK_MS = (BOOKING.visitMinutes + BOOKING.driveMinutes) * MINUTE;
const DRIVE_MS = BOOKING.driveMinutes * MINUTE;

/** A stretch of time the calendar is taken. */
export type Busy = { start: Date; end: Date };

export type SlotDay = { date: string; slots: Date[] };

/** The calendar day after YYYY-MM-DD. Noon UTC keeps the arithmetic clear of any zone. */
const nextDate = (ymd: string): string =>
  new Date(new Date(`${ymd}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

const isSunday = (ymd: string): boolean => new Date(`${ymd}T12:00:00Z`).getUTCDay() === 0;

/** Every bookable start, by Las Vegas day: on the hour, open to the last start whose block ends by closing. */
export function candidateDays(now: Date): SlotDay[] {
  const days: SlotDay[] = [];
  let date = lasVegasDate(now);
  for (let i = 0; i < BOOKING.horizonDays; i++) {
    date = nextDate(date);
    if (isSunday(date)) continue;
    const slots: Date[] = [];
    const lastStart = BOOKING.closeHour - (BOOKING.visitMinutes + BOOKING.driveMinutes) / 60;
    for (let hour = BOOKING.openHour; hour <= lastStart; hour++) {
      slots.push(fromLocalInput(`${date}T${String(hour).padStart(2, "0")}:00`));
    }
    days.push({ date, slots });
  }
  return days;
}

/**
 * Whether a visit starting at `start` fits around `busy`: the visit and the drive after it end before
 * anything else begins, and anything before it ended at least a drive earlier.
 */
export function isOpen(start: Date, busy: Busy[]): boolean {
  const from = start.getTime();
  const to = from + BLOCK_MS;
  return busy.every((b) => b.end.getTime() + DRIVE_MS <= from || b.start.getTime() >= to);
}

/** The open slots on each candidate day. A day with none left is dropped. */
export function openDays(now: Date, busy: Busy[]): SlotDay[] {
  return candidateDays(now)
    .map((day) => ({ date: day.date, slots: day.slots.filter((slot) => isOpen(slot, busy)) }))
    .filter((day) => day.slots.length > 0);
}

/** Whether `start` is one of the starts offered at `now`, open or not. */
export const isCandidate = (start: Date, now: Date): boolean =>
  candidateDays(now).some((day) => day.slots.some((slot) => slot.getTime() === start.getTime()));

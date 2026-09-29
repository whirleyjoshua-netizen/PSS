import { fromLocalInput, lasVegasDate } from "@/lib/admin/time";

const DAY_MS = 86_400_000;
const noonUtc = (day: string) => new Date(`${day}T12:00:00Z`);
const addDays = (day: string, n: number) => new Date(noonUtc(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);
/** 0 is Sunday. */
const weekday = (day: string) => noonUtc(day).getUTCDay();
const ymd = (year: number, month: number, date: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;

/** The nth `dow` (0 = Sunday) of a month, 1-based; n = -1 is the last one. */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  if (n > 0) {
    const first = weekday(ymd(year, month, 1));
    return ymd(year, month, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekday(ymd(year, month, lastDate));
  return ymd(year, month, lastDate - ((last - dow + 7) % 7));
}

/**
 * The eleven US federal holidays of spec §9 for `year`, plus the weekday a fixed-date one is
 * observed on when it falls on a weekend. Counting the observed day too can only lengthen the
 * window, which is the safe direction: the order is never placed early.
 */
export function federalHolidays(year: number): string[] {
  const fixed = [ymd(year, 1, 1), ymd(year, 6, 19), ymd(year, 7, 4), ymd(year, 11, 11), ymd(year, 12, 25)];
  const floating = [
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Presidents' Day
    nthWeekday(year, 5, 1, -1), // Memorial Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 10, 1, 2), // Columbus Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
  ];
  const observed = fixed
    .map((day) => (weekday(day) === 6 ? addDays(day, -1) : weekday(day) === 0 ? addDays(day, 1) : null))
    .filter((day): day is string => day !== null);
  return [...new Set([...fixed, ...floating, ...observed])].sort();
}

/** Next year's list too: a Saturday New Year's Day is observed on this year's Dec 31. */
export function isFederalHoliday(day: string): boolean {
  const year = Number(day.slice(0, 4));
  return federalHolidays(year).includes(day) || federalHolidays(year + 1).includes(day);
}

/** Spec §9: every day except Sundays and federal holidays. Saturdays count. */
export const isBusinessDay = (day: string): boolean => weekday(day) !== 0 && !isFederalHoliday(day);

export const CANCEL_BUSINESS_DAYS = 3;

/** The 3rd business day after the signing date, the signing date read in Las Vegas time. */
export function cancellationWindowLastDay(signedAt: Date): string {
  let day = lasVegasDate(signedAt);
  let counted = 0;
  while (counted < CANCEL_BUSINESS_DAYS) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) counted += 1;
  }
  return day;
}

/** Midnight in Las Vegas at the end of the last day of the window. */
export const cancellationWindowEnd = (signedAt: Date): Date =>
  fromLocalInput(`${addDays(cancellationWindowLastDay(signedAt), 1)}T00:00`);

export const inCancellationWindow = (signedAt: Date, now: Date): boolean =>
  now.getTime() < cancellationWindowEnd(signedAt).getTime();

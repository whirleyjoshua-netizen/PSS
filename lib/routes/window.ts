import type { Clock } from "./types";

export const clockMinutes = (clock: Clock): number => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

export const minutesClock = (minutes: number): Clock =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** A Postgres `time` value ("08:30:00") as a Clock; anything that is not a string is no clock. */
export const clockOf = (value: unknown): Clock | null => (typeof value === "string" ? value.slice(0, 5) : null);

/** Shifts a "YYYY-MM-DD" calendar day by whole days. Working at noon UTC keeps daylight saving out of it. */
export const addDaysIso = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const parts = (clock: Clock) => {
  const total = clockMinutes(clock);
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { time: `${h12}:${String(total % 60).padStart(2, "0")}`, period: h24 < 12 ? "am" : "pm" };
};

export const clockLabel = (clock: Clock): string => {
  const p = parts(clock);
  return `${p.time} ${p.period}`;
};

export const WINDOW_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const value = minutesClock(360 + i * 30);
  return { value, label: clockLabel(value) };
});

const joined = (start: Clock, end: Clock, separator: string): string => {
  const a = parts(start);
  const b = parts(end);
  return a.period === b.period
    ? `${a.time}${separator}${b.time} ${b.period}`
    : `${a.time} ${a.period}${separator}${b.time} ${b.period}`;
};

export const windowLabel = (start: Clock | null, end: Clock | null): string | null =>
  start && end ? joined(start, end, " – ") : null;

export const emailWindowLine = (start: Clock | null, end: Clock | null): string | null =>
  start && end ? `We'll arrive between ${joined(start, end, " and ")}.` : null;

export const hoursLabel = (minutes: number): string => String(minutes / 60);

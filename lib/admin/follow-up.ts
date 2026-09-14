import { formatCallVisit, fromLocalInput, toLocalInput } from "./time";

export const FOLLOW_UP_NOTE_MAX = 200;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const YEAR_MS = 366 * 24 * 60 * 60 * 1000;

export type QuickPick = { label: string; value: string };

/** "2026-10-31" + 1 → "2026-11-01", read at noon UTC so the date never shifts. */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** One-tap call-back times, in Las Vegas time. "Later today" only before 3 PM. */
export function quickPicks(now: Date): QuickPick[] {
  const local = toLocalInput(now);
  const today = local.slice(0, 10);
  const hour = Number(local.slice(11, 13));
  const picks: QuickPick[] = [];
  if (hour < 15) picks.push({ label: "Later today 4 PM", value: `${today}T16:00` });
  picks.push({ label: "Tomorrow 10 AM", value: `${addDays(today, 1)}T10:00` });
  picks.push({ label: "In 2 days 10 AM", value: `${addDays(today, 2)}T10:00` });
  picks.push({ label: "Next week 10 AM", value: `${addDays(today, 7)}T10:00` });
  return picks;
}

/** The instant today ends in Las Vegas (midnight starting tomorrow). */
export function endOfTodayLasVegas(now: Date): Date {
  return fromLocalInput(`${addDays(toLocalInput(now).slice(0, 10), 1)}T00:00`);
}

export const formatFollowUp = (at: Date, note: string | null): string =>
  note ? `${formatCallVisit(at)} · ${note}` : formatCallVisit(at);

export function dueLabel(at: Date, now: Date): { overdue: boolean; text: string } {
  const when = formatCallVisit(at);
  if (at.getTime() < now.getTime()) return { overdue: true, text: `Overdue · ${when}` };
  return { overdue: false, text: `Today · ${when.split(", ")[1]}` };
}

/** Why a typed call-back time is unusable, or null. Past times are fine; they show as overdue. */
export function callBackProblem(value: string, now: Date): string | null {
  if (!LOCAL_TIME.test(value) || Number.isNaN(new Date(`${value}:00Z`).getTime())) {
    return "Pick a valid call-back date and time";
  }
  if (fromLocalInput(value).getTime() - now.getTime() > YEAR_MS) return "Pick a call-back within a year";
  return null;
}

import "server-only";
import { db } from "@/lib/db";
import { fromLocalInput, lasVegasDate } from "@/lib/admin/time";
import type { Stage } from "@/lib/admin/stages";
import { kindLabel } from "@/lib/admin/appointment-kinds";
import { calendarConfig, calendarEnabled } from "./config";
import { nextDay, type GraphEvent, type Kind } from "./events";
import { graphJson } from "./graph";

export type ScheduleItem = {
  key: string; day: string; allDay: boolean; start: Date | null; end: Date | null; title: string;
  job: { id: string; name: string; city: string; status: Stage; kind: Kind } | null;
};
export type Week = { days: string[]; items: ScheduleItem[]; source: "outlook" | "tracker"; notice: string | null };

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
export function addDays(date: string, n: number): string {
  const d = noon(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sunday-to-Saturday dates of the week containing `param` (YYYY-MM-DD), or today in Las Vegas. */
export function weekDays(param: string | undefined, now: Date): string[] {
  const parsed = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? noon(param) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === param;
  const anchor = valid ? (param as string) : lasVegasDate(now);
  const sunday = addDays(anchor, -noon(anchor).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => noon(date).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** "Sep 13 – 19, 2026", "Sep 27 – Oct 3, 2026", "Dec 27, 2026 – Jan 2, 2027". */
export function rangeLabel(days: string[]): string {
  const [a, b] = [days[0], days[6]];
  if (a.slice(0, 4) !== b.slice(0, 4)) {
    return `${fmt(a, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(b, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  const end = a.slice(0, 7) === b.slice(0, 7) ? fmt(b, { day: "numeric" }) : fmt(b, { month: "short", day: "numeric" });
  return `${fmt(a, { month: "short", day: "numeric" })} – ${end}, ${a.slice(0, 4)}`;
}

/**
 * The displayed days an Outlook event covers. An all-day event covers its start date up to, not including,
 * its end date; a timed one every Las Vegas date from its start instant up to, not including, its end
 * instant, so an event ending exactly at midnight stays on one day.
 */
function coveredDays(event: GraphEvent, days: string[]): string[] {
  const first = event.start.dateTime.slice(0, 10);
  let last = first;
  if (event.isAllDay === true) {
    const end = event.end.dateTime.slice(0, 10);
    if (end > first) last = addDays(end, -1);
  } else {
    const start = fromLocalInput(event.start.dateTime.slice(0, 16));
    const end = fromLocalInput(event.end.dateTime.slice(0, 16));
    if (end > start) last = lasVegasDate(new Date(end.getTime() - 1));
  }
  return days.filter((day) => day >= first && day <= last);
}

const order = (a: ScheduleItem, b: ScheduleItem) =>
  a.day.localeCompare(b.day) || Number(b.allDay) - Number(a.allDay) || (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0);

/**
 * The tracker's own view of the range: every CONFIRMED appointment of any kind, from the appointments
 * table rather than the leads.visit_at / leads.install_on mirrors, so Measure and Service appear too.
 * A pending appointment is not a commitment and is not on Outlook either, so it never shows here.
 */
async function trackerItems(from: Date, to: Date): Promise<ScheduleItem[]> {
  const rows = await db()`
    select a.kind, a.starts_at, a.all_day, j.id as job_id, j.name, j.city, j.status
      from appointments a join leads j on j.id = a.lead_id
     where j.status <> 'lost'
       and a.confirmed_at is not null
       and a.starts_at >= ${from} and a.starts_at < ${to}`;
  return rows.map((row): ScheduleItem => {
    const kind = row.kind as Kind;
    const job = {
      id: row.job_id as string, name: row.name as string, city: row.city as string,
      status: row.status as Stage, kind,
    };
    const startsAt = new Date(row.starts_at as string | Date);
    const allDay = row.all_day === true;
    return {
      key: `${job.id}:${kind}`,
      // Correct only because an all-day appointment is stored at 09:00 America/Los_Angeles
      // (migration 014, moved by 017). Storing one at 00:00 UTC instead would land this on the previous day.
      day: lasVegasDate(startsAt),
      allDay,
      start: allDay ? null : startsAt,
      end: allDay ? null : new Date(startsAt.getTime() + 3_600_000),
      title: `${kindLabel(kind)} · ${job.name}`,
      job,
    };
  });
}

async function loadRange(days: string[]): Promise<{ items: ScheduleItem[]; source: "outlook" | "tracker"; notice: string | null }> {
  const from = fromLocalInput(`${days[0]}T00:00`);
  const to = fromLocalInput(`${nextDay(days[days.length - 1])}T00:00`);
  const displayed = new Set(days);
  const tracker = (await trackerItems(from, to)).filter((item) => displayed.has(item.day)).sort(order);
  if (!calendarEnabled()) return { items: tracker, source: "tracker", notice: "Outlook isn't connected yet." };
  try {
    const mailbox = calendarConfig()!.mailbox;
    const value: GraphEvent[] = [];
    let next: string | undefined =
      `users/${mailbox}/calendar/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}` +
      "&$select=id,subject,start,end,isAllDay&$top=200&$orderby=start/dateTime";
    let page = 0;
    for (; page < 10 && next; page++) {
      const result: { value: GraphEvent[]; "@odata.nextLink"?: string } = await graphJson(next);
      value.push(...result.value);
      next = result["@odata.nextLink"];
    }
    if (page === 10 && next) console.warn("Schedule: truncated Outlook paging at 10 pages");
    const ids = value.map((e) => e.id);
    const links = ids.length
      ? await db()`
          select l.event_id, l.kind, j.id, j.name, j.city, j.status
          from job_calendar_events l join leads j on j.id = l.lead_id where l.event_id = any(${ids})`
      : [];
    const byEvent = new Map(links.map((row) => [row.event_id as string, row]));
    // One copy per displayed day the event covers; each copy keeps the event's real start and end.
    const items = value.flatMap((event): ScheduleItem[] => {
      const link = byEvent.get(event.id);
      const allDay = event.isAllDay === true;
      const base = {
        allDay,
        start: allDay ? null : fromLocalInput(event.start.dateTime.slice(0, 16)),
        end: allDay ? null : fromLocalInput(event.end.dateTime.slice(0, 16)),
        title: event.subject || "(no title)",
        job: link ? { id: link.id as string, name: link.name as string, city: link.city as string,
          status: link.status as Stage, kind: link.kind as Kind } : null,
      };
      return coveredDays(event, days).map((day) => ({ key: `${event.id}:${day}`, day, ...base }));
    });
    return { items: items.sort(order), source: "outlook", notice: null };
  } catch (error) {
    console.error("Schedule could not read Outlook", error);
    return { items: tracker, source: "tracker", notice: "Couldn't reach Outlook, showing tracker dates only." };
  }
}

/** The Sunday-to-Saturday grid of days covering the given month, or the current Las Vegas month. */
export function monthGrid(param: string | undefined, now: Date): { month: string; days: string[] } {
  const valid = param && /^\d{4}-\d{2}$/.test(param) && Number(param.slice(5, 7)) >= 1 && Number(param.slice(5, 7)) <= 12;
  const month = valid ? (param as string) : lasVegasDate(now).slice(0, 7);
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;
  const start = addDays(first, -noon(first).getUTCDay());
  const end = addDays(last, 6 - noon(last).getUTCDay());
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return { month, days };
}

/** "September 2026" for a YYYY-MM month. */
export function monthLabel(month: string): string {
  return noon(`${month}-01`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}

export async function getMonth(
  param: string | undefined, now = new Date(),
): Promise<{ month: string; days: string[]; items: ScheduleItem[]; source: "outlook" | "tracker"; notice: string | null }> {
  const { month, days } = monthGrid(param, now);
  const { items, source, notice } = await loadRange(days);
  return { month, days, items, source, notice };
}

export async function getWeek(param: string | undefined, now = new Date()): Promise<Week> {
  const days = weekDays(param, now);
  const { items, source, notice } = await loadRange(days);
  return { days, items, source, notice };
}

/** All schedule items for a single YYYY-MM-DD date, tracker or Outlook. */
export async function getDay(date: string): Promise<{ date: string; items: ScheduleItem[]; source: "outlook" | "tracker"; notice: string | null }> {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? noon(date) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  if (!valid) throw new Error("Invalid date");
  const { items, source, notice } = await loadRange([date]);
  return { date, items: items.filter((item) => item.day === date), source, notice };
}

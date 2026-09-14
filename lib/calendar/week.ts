import "server-only";
import { db } from "@/lib/db";
import { fromLocalInput, lasVegasDate } from "@/lib/admin/time";
import type { Stage } from "@/lib/admin/stages";
import { calendarConfig, calendarEnabled } from "./config";
import { nextDay, type GraphEvent } from "./events";
import { graphJson } from "./graph";

export type ScheduleItem = {
  key: string; day: string; allDay: boolean; start: Date | null; title: string;
  job: { id: string; name: string; city: string; status: Stage; kind: "visit" | "install" } | null;
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

const order = (a: ScheduleItem, b: ScheduleItem) =>
  a.day.localeCompare(b.day) || Number(b.allDay) - Number(a.allDay) || (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0);

async function trackerItems(days: string[], from: Date, to: Date): Promise<ScheduleItem[]> {
  const rows = await db()`
    select id, name, city, status, visit_at, install_on::text as install_on from leads
     where status <> 'lost'
       and ((visit_at >= ${from} and visit_at < ${to}) or install_on between ${days[0]}::date and ${days[6]}::date)`;
  const items: ScheduleItem[] = [];
  for (const row of rows) {
    const base = { id: row.id as string, name: row.name as string, city: row.city as string, status: row.status as Stage };
    const visit = row.visit_at ? new Date(row.visit_at as string) : null;
    if (visit && visit >= from && visit < to) {
      items.push({ key: `${base.id}:visit`, day: lasVegasDate(visit), allDay: false, start: visit,
        title: `Visit · ${base.name}`, job: { ...base, kind: "visit" } });
    }
    const install = row.install_on as string | null;
    if (install && install >= days[0] && install <= days[6]) {
      items.push({ key: `${base.id}:install`, day: install, allDay: true, start: null,
        title: `Install · ${base.name}`, job: { ...base, kind: "install" } });
    }
  }
  return items;
}

export async function getWeek(param: string | undefined, now = new Date()): Promise<Week> {
  const days = weekDays(param, now);
  const from = fromLocalInput(`${days[0]}T00:00`);
  const to = fromLocalInput(`${nextDay(days[6])}T00:00`);
  const tracker = (await trackerItems(days, from, to)).sort(order);
  if (!calendarEnabled()) return { days, items: tracker, source: "tracker", notice: "Outlook isn't connected yet." };
  try {
    const mailbox = calendarConfig()!.mailbox;
    const { value } = await graphJson<{ value: GraphEvent[] }>(
      `users/${mailbox}/calendar/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}` +
        "&$select=id,subject,start,end,isAllDay&$top=200&$orderby=start/dateTime",
    );
    const ids = value.map((e) => e.id);
    const links = ids.length
      ? await db()`
          select l.event_id, l.kind, j.id, j.name, j.city, j.status
          from job_calendar_events l join leads j on j.id = l.lead_id where l.event_id = any(${ids})`
      : [];
    const byEvent = new Map(links.map((row) => [row.event_id as string, row]));
    const items = value.map((event): ScheduleItem => {
      const link = byEvent.get(event.id);
      const allDay = event.isAllDay === true;
      return {
        key: event.id, day: event.start.dateTime.slice(0, 10), allDay,
        start: allDay ? null : fromLocalInput(event.start.dateTime.slice(0, 16)),
        title: event.subject || "(no title)",
        job: link ? { id: link.id as string, name: link.name as string, city: link.city as string,
          status: link.status as Stage, kind: link.kind as "visit" | "install" } : null,
      };
    });
    return { days, items: items.sort(order), source: "outlook", notice: null };
  } catch (error) {
    console.error("Schedule could not read Outlook", error);
    return { days, items: tracker, source: "tracker", notice: "Couldn't reach Outlook, showing tracker dates only." };
  }
}

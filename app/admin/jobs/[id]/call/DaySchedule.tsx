"use client";

import { useEffect, useState } from "react";
import { clashes, effectiveEnd } from "@/lib/calendar/clash";
import type { DayScheduleItem } from "@/lib/calendar/day-schedule";
import { callDaySchedule } from "../../call-actions";

/** A fetched result, tagged with the job and date it belongs to, so a stale one is never shown. */
type Loaded =
  | { jobId: string; date: string; ok: true; items: DayScheduleItem[]; notice: string | null }
  | { jobId: string; date: string; ok: false };

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

const timeLabel = (date: Date) =>
  date.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

const order = (a: DayScheduleItem, b: DayScheduleItem) =>
  Number(b.allDay) - Number(a.allDay) || (a.start ? new Date(a.start).getTime() : 0) - (b.start ? new Date(b.start).getTime() : 0);

export function DaySchedule({ jobId, date, slotStart }: { jobId: string; date: string; slotStart: Date | null }) {
  const [result, setResult] = useState<Loaded | null>(null);

  // State is only set in the promise callbacks; "loading" is derived from having no result for this date yet.
  useEffect(() => {
    let ignore = false;
    callDaySchedule(jobId, date).then(
      (day) => {
        if (ignore) return;
        setResult(day.ok ? { jobId, date, ok: true, items: day.items, notice: day.notice } : { jobId, date, ok: false });
      },
      () => { if (!ignore) setResult({ jobId, date, ok: false }); },
    );
    return () => { ignore = true; };
  }, [jobId, date]);

  const current = result && result.jobId === jobId && result.date === date ? result : null;
  const status = !current ? "loading" : current.ok ? "ok" : "error";
  const loaded = current?.ok ? current : null;
  const items = loaded ? [...loaded.items].sort(order) : [];
  const timed = items.map((item) => ({
    allDay: item.allDay, start: item.start ? new Date(item.start) : null, end: item.end ? new Date(item.end) : null,
  }));
  const clashed = timed.map((item) => (slotStart ? clashes(item, slotStart) : false));
  const anyClash = clashed.some(Boolean);

  return (
    <section aria-labelledby="call-day-heading" aria-live="polite" className="flex flex-col gap-2 border border-rule bg-ivory p-4">
      <h2 id="call-day-heading" className="text-sm font-semibold text-charcoal">That day on the calendar · {dayLabel(date)}</h2>
      {status === "loading" ? <p className="text-sm text-ink-soft">Loading that day…</p> : null}
      {status === "error" ? <p className="text-sm text-overdue">Couldn&apos;t load that day&apos;s schedule.</p> : null}
      {status === "ok" && loaded?.notice ? <p className="text-sm text-ink-soft">{loaded.notice}</p> : null}
      {status === "ok" && anyClash ? <p className="text-sm text-overdue">This time overlaps something already booked.</p> : null}
      {status === "ok" && items.length === 0 ? <p className="text-sm text-ink-soft">Nothing else booked that day.</p> : null}
      {status === "ok" && items.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => {
            const clash = clashed[i];
            const { start } = timed[i];
            const end = effectiveEnd(timed[i]);
            const label = start && end ? `${timeLabel(start)} – ${timeLabel(end)} · ${item.title}` : `All day · ${item.title}`;
            return (
              <li key={item.key} data-clash={clash ? "true" : undefined}
                className={`text-sm ${clash ? "border-l-4 border-overdue pl-2 text-overdue" : ""}`}>
                {label}{clash ? " — clashes with this time" : ""}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

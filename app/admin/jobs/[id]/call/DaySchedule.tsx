"use client";

import { useEffect, useState } from "react";
import { clashes } from "@/lib/calendar/clash";
import type { DayScheduleItem } from "@/lib/calendar/day-schedule";
import { callDaySchedule } from "../../call-actions";

type Status = "loading" | "ok" | "error";
type Loaded = { items: DayScheduleItem[]; notice: string | null };

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

const order = (a: DayScheduleItem, b: DayScheduleItem) =>
  Number(b.allDay) - Number(a.allDay) || (a.start ? new Date(a.start).getTime() : 0) - (b.start ? new Date(b.start).getTime() : 0);

export function DaySchedule({ jobId, date, slotStart }: { jobId: string; date: string; slotStart: Date | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let ignore = false;
    setStatus("loading");
    setLoaded(null);
    callDaySchedule(jobId, date).then((result) => {
      if (ignore) return;
      if (!result.ok) { setStatus("error"); return; }
      setLoaded({ items: result.items, notice: result.notice });
      setStatus("ok");
    });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, date]);

  const items = loaded ? [...loaded.items].sort(order) : [];
  const clashed = slotStart
    ? items.map((item) => clashes({ allDay: item.allDay, start: item.start ? new Date(item.start) : null, end: item.end ? new Date(item.end) : null }, slotStart))
    : items.map(() => false);
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
            const label = item.allDay
              ? `All day · ${item.title}`
              : `${timeLabel(item.start!)} – ${timeLabel(item.end ?? new Date(new Date(item.start!).getTime() + 3_600_000).toISOString())} · ${item.title}`;
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

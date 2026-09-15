import Link from "next/link";
import { STAGE_STYLE } from "@/lib/admin/stages";
import { lasVegasDate } from "@/lib/admin/time";
import { monthLabel, type ScheduleItem } from "@/lib/calendar/week";
import { whenLabel } from "@/lib/calendar/labels";
import { ScheduleCard } from "./ScheduleCard";
import { ScheduleHeader } from "./ScheduleHeader";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const dayHeading = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

const cellName = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

function cellLine(item: ScheduleItem): { text: string; className: string } {
  const when = item.allDay || !item.start ? "All day" : whenLabel(item.start, item.end, item.day);
  if (item.job) {
    const kind = item.job.kind === "visit" ? "Visit" : "Install";
    return { text: `${when} · ${kind} · ${item.job.name}`, className: `border-l-2 pl-1 ${STAGE_STYLE[item.job.status].left}` };
  }
  return { text: `${when} · ${item.title}`, className: "text-ink-soft" };
}

export function MonthView({
  month: displayedMonth, days, items, notice, day, now,
}: {
  month: string; days: string[]; items: ScheduleItem[]; notice: string | null; day?: string; now: Date;
}) {
  const today = lasVegasDate(now);
  const isCurrentMonth = displayedMonth === today.slice(0, 7);
  const validDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && days.includes(day) ? day : undefined;
  const selectedDay = validDay ?? (isCurrentMonth ? today : undefined);
  const weekHref = `/admin/schedule?week=${selectedDay ?? `${displayedMonth}-01`}`;
  const dayItems = selectedDay ? items.filter((item) => item.day === selectedDay) : [];

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <ScheduleHeader
        label={monthLabel(displayedMonth)}
        view="month"
        switchHrefs={{ week: weekHref, month: `/admin/schedule?view=month&month=${displayedMonth}` }}
        nav={{
          label: "Months",
          previous: { href: `/admin/schedule?view=month&month=${shiftMonth(displayedMonth, -1)}`, text: "← Previous month" },
          current: { href: "/admin/schedule?view=month", text: "This month" },
          next: { href: `/admin/schedule?view=month&month=${shiftMonth(displayedMonth, 1)}`, text: "Next month →" },
        }}
      />

      {notice ? <p role="status" className="text-sm text-ink-soft">{notice}</p> : null}
      {items.some((item) => days.includes(item.day)) ? null : <p className="text-sm text-ink-soft">Nothing scheduled this month.</p>}

      <ol className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {WEEKDAY_NAMES.map((name) => <li key={name}>{name}</li>)}
      </ol>
      <ol className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const inMonth = date.slice(0, 7) === displayedMonth;
          const isToday = date === today;
          const isSelected = date === selectedDay;
          const cellItems = items.filter((item) => item.day === date);
          const shown = cellItems.slice(0, 3);
          const extra = cellItems.length - shown.length;
          const dayNum = Number(date.slice(8, 10));
          return (
            <li key={date}>
              <Link
                href={`/admin/schedule?view=month&month=${displayedMonth}&day=${date}`}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${cellName(date)}, ${cellItems.length ? `${cellItems.length} booked` : "nothing booked"}`}
                className={`flex min-h-24 min-w-0 flex-col gap-1 overflow-hidden rounded-lg border p-1 text-left text-xs ${
                  inMonth ? "" : "text-ink-soft opacity-60"
                } ${isToday ? "border-champagne-ink" : "border-rule"} ${isSelected ? "ring-2 ring-charcoal" : ""}`}
              >
                <span className="font-semibold text-charcoal">{dayNum}</span>
                <div className="hidden flex-col gap-0.5 md:flex">
                  {shown.map((item) => {
                    const line = cellLine(item);
                    return <p key={item.key} className={`truncate ${line.className}`}>{line.text}</p>;
                  })}
                  {extra > 0 ? <p className="truncate text-ink-soft">+{extra} more</p> : null}
                </div>
                <div className="md:hidden">
                  {cellItems.length > 0 ? <p className="truncate">{cellItems.length} booked</p> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="month-day-heading" className="flex flex-col gap-3">
        <h2 id="month-day-heading" className="text-lg font-semibold text-charcoal">
          {selectedDay ? dayHeading(selectedDay) : "Select a day"}
        </h2>
        {selectedDay ? (
          dayItems.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {dayItems.map((item) => <ScheduleCard key={item.key} item={item} />)}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Nothing booked this day.</p>
          )
        ) : (
          <p className="text-sm text-ink-soft">Pick a day to see its appointments.</p>
        )}
      </section>
    </div>
  );
}

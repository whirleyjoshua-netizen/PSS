import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import { lasVegasDate } from "@/lib/admin/time";
import { addDays, rangeLabel, type ScheduleItem } from "@/lib/calendar/week";
import { ScheduleCard } from "./ScheduleCard";
import { ViewSwitch } from "./ViewSwitch";

const dayName = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  const dayNum = d.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" });
  return `${weekday} ${dayNum}`;
};

export function WeekView({
  days, items, notice, now,
}: {
  days: string[]; items: ScheduleItem[]; notice: string | null; now: Date;
}) {
  const today = lasVegasDate(now);
  const monthOfWednesday = days[3].slice(0, 7);

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-soft">PSS Operations</p>
          <h1 className="text-3xl font-semibold text-charcoal">Schedule</h1>
          <p className="text-sm text-ink-soft">{rangeLabel(days)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ViewSwitch active="week" weekHref="/admin/schedule" monthHref={`/admin/schedule?view=month&month=${monthOfWednesday}`} />
          <nav aria-label="Weeks" className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/admin/schedule?week=${addDays(days[0], -7)}`} className="underline underline-offset-4">← Previous week</Link>
            <Link href="/admin/schedule" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charcoal px-4 font-medium text-ivory">
              <Icon name="calendar" className="size-4" />
              This week
            </Link>
            <Link href={`/admin/schedule?week=${addDays(days[0], 7)}`} className="underline underline-offset-4">Next week →</Link>
          </nav>
        </div>
      </header>

      {notice ? <p role="status" className="text-sm text-ink-soft">{notice}</p> : null}
      {items.some((item) => days.includes(item.day)) ? null : <p className="text-sm text-ink-soft">Nothing scheduled this week.</p>}

      <ol className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const isToday = day === today;
          const dayItems = items.filter((item) => item.day === day);
          return (
            <li
              key={day}
              aria-labelledby={`day-${day}`}
              className={`flex min-h-32 flex-col gap-2 rounded-xl border bg-sand/40 p-2 ${isToday ? "border-champagne-ink" : "border-rule"}`}
            >
              <h2 id={`day-${day}`} className="text-sm font-semibold text-charcoal">
                {isToday ? `Today · ${dayName(day)}` : dayName(day)}
              </h2>
              {dayItems.map((item) => <ScheduleCard key={item.key} item={item} />)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

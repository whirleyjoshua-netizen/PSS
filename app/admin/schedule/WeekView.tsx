import { lasVegasDate } from "@/lib/admin/time";
import { addDays, rangeLabel, type ScheduleItem } from "@/lib/calendar/week";
import { ScheduleCard } from "./ScheduleCard";
import { ScheduleHeader } from "./ScheduleHeader";

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
  const routeDay = days.includes(today) ? today : days[0];
  const monthOfWednesday = days[3].slice(0, 7);

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <ScheduleHeader
        label={rangeLabel(days)}
        view="week"
        switchHrefs={{ week: "/admin/schedule", month: `/admin/schedule?view=month&month=${monthOfWednesday}`,
          route: `/admin/schedule?view=route&day=${routeDay}`,
        }}
        nav={{
          label: "Weeks",
          previous: { href: `/admin/schedule?week=${addDays(days[0], -7)}`, text: "← Previous week" },
          current: { href: "/admin/schedule", text: "This week", icon: true },
          next: { href: `/admin/schedule?week=${addDays(days[0], 7)}`, text: "Next week →" },
        }}
      />

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

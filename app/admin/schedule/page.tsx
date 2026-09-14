import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import { requireAdmin } from "@/lib/admin/session";
import { STAGE_STYLE } from "@/lib/admin/stages";
import { lasVegasDate } from "@/lib/admin/time";
import { addDays, getWeek, rangeLabel, type ScheduleItem } from "@/lib/calendar/week";

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
const dayName = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  const dayNum = d.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" });
  return `${weekday} ${dayNum}`;
};

function Item({ item }: { item: ScheduleItem }) {
  const when = item.allDay || !item.start ? "All day" : formatTime(item.start);
  if (!item.job) {
    return (
      <div className="rounded-lg border border-rule bg-ivory/60 p-2 text-xs text-ink-soft opacity-70">
        <p>{when}</p>
        <p>{item.title}</p>
      </div>
    );
  }
  const { job } = item;
  return (
    <Link
      href={`/admin?job=${job.id}`}
      className={`flex flex-col gap-0.5 rounded-lg border border-rule border-l-4 ${STAGE_STYLE[job.status].left} bg-ivory p-2 text-xs shadow-sm hover:shadow-md`}
    >
      <span className="text-ink-soft">{when} · {job.kind === "visit" ? "Visit" : "Install"}</span>
      <span className="text-sm font-semibold text-charcoal">{job.name}</span>
      <span className="text-ink-soft">{job.city}</span>
    </Link>
  );
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  await requireAdmin();
  const params = await searchParams;
  const param = Array.isArray(params.week) ? params.week[0] : params.week;
  const { days, items, notice } = await getWeek(param);
  const today = lasVegasDate(new Date());

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-soft">PSS Operations</p>
          <h1 className="text-3xl font-semibold text-charcoal">Schedule</h1>
          <p className="text-sm text-ink-soft">{rangeLabel(days)}</p>
        </div>
        <nav aria-label="Weeks" className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/admin/schedule?week=${addDays(days[0], -7)}`} className="underline underline-offset-4">← Previous week</Link>
          <Link href="/admin/schedule" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charcoal px-4 font-medium text-ivory">
            <Icon name="calendar" className="size-4" />
            This week
          </Link>
          <Link href={`/admin/schedule?week=${addDays(days[0], 7)}`} className="underline underline-offset-4">Next week →</Link>
        </nav>
      </header>

      {notice ? <p role="status" className="text-sm text-ink-soft">{notice}</p> : null}
      {items.length === 0 ? <p className="text-sm text-ink-soft">Nothing scheduled this week.</p> : null}

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
              {dayItems.map((item) => <Item key={item.key} item={item} />)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

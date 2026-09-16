import Link from "next/link";
import { STAGE_STYLE } from "@/lib/admin/stages";
import { whenLabel } from "@/lib/calendar/labels";
import type { ScheduleItem } from "@/lib/calendar/week";

export function ScheduleCard({ item }: { item: ScheduleItem }) {
  const when = item.allDay || !item.start ? "All day" : whenLabel(item.start, item.end, item.day);
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
      href={`/admin/jobs/${job.id}`}
      className={`flex flex-col gap-0.5 rounded-lg border border-rule border-l-4 ${STAGE_STYLE[job.status].left} bg-ivory p-2 text-xs shadow-sm hover:shadow-md`}
    >
      <span className="text-ink-soft">{when} · {job.kind === "visit" ? "Visit" : "Install"}</span>
      <span className="text-sm font-semibold text-charcoal">{job.name}</span>
      <span className="text-ink-soft">{job.city}</span>
    </Link>
  );
}

import type { JobEvent } from "@/lib/admin/jobs";
import { stageLabel } from "@/lib/admin/stages";
import { dayLabel, formatTime } from "@/lib/admin/time";

/** The job's events, newest first, grouped by Las Vegas day. */
export function EventList({ events, now }: { events: JobEvent[]; now: Date }) {
  if (events.length === 0) return <p className="text-sm text-ink-soft">No activity yet.</p>;

  const groups: { label: string; events: JobEvent[] }[] = [];
  for (const event of events) {
    const label = dayLabel(event.createdAt, now);
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{group.label}</h3>
          <ol className="flex flex-col gap-3 border-l border-rule pl-4 text-sm">
            {group.events.map((event) => (
              <li key={event.id} className="grid grid-cols-[4.5rem_1fr] gap-x-3">
                <span className="text-xs text-ink-soft">{formatTime(event.createdAt)}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  {event.kind === "stage" && event.toStatus ? (
                    <p className="flex flex-wrap items-center gap-2">
                      <span>Moved the job</span>
                      <span className="border border-rule bg-sand px-2 py-0.5 text-xs">
                        {`${event.fromStatus ? `${stageLabel(event.fromStatus)} → ` : ""}${stageLabel(event.toStatus)}`}
                      </span>
                    </p>
                  ) : (
                    <p className="whitespace-pre-line text-charcoal">{event.body}</p>
                  )}
                  {event.kind === "stage" && event.body ? <p className="text-ink-soft">{event.body}</p> : null}
                  <p className="text-xs text-ink-soft">{event.actor}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

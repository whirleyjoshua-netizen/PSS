import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { dueLabel } from "@/lib/admin/follow-up";

const LIMIT = 20;

/** Call-backs due today or overdue. Hidden when there are none. */
export function FollowUpsDue({ jobs, now }: { jobs: Job[]; now: Date }) {
  const due = jobs.filter((job) => job.followUpAt);
  if (due.length === 0) return null;
  const shown = due.slice(0, LIMIT);

  return (
    <section aria-labelledby="follow-ups-due" className="flex flex-col gap-3 rounded-xl border border-rule bg-ivory p-4 shadow-sm">
      <h2 id="follow-ups-due" className="text-sm font-semibold text-charcoal">Follow-ups due · {due.length}</h2>
      <ul className="flex flex-col divide-y divide-rule">
        {shown.map((job) => {
          const label = dueLabel(job.followUpAt as Date, now);
          return (
            <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <Link href={`/admin/jobs/${job.id}`} className="font-semibold underline-offset-4 hover:underline">{job.name}</Link>
              <span className={label.overdue ? "font-semibold text-overdue" : "text-ink-soft"}>{label.text}</span>
              {job.followUpNote ? <span className="text-ink-soft">{job.followUpNote}</span> : null}
              <Link href={`/admin/jobs/${job.id}/call`} className="ml-auto inline-flex min-h-11 items-center px-3 underline underline-offset-4">Call</Link>
            </li>
          );
        })}
      </ul>
      {due.length > LIMIT ? <p className="text-sm text-ink-soft">and {due.length - LIMIT} more</p> : null}
    </section>
  );
}

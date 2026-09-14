import Link from "next/link";
import { JOB_TABS, tabHref, type JobTab } from "./tabs";

export function JobTabs({ jobId, active, counts }: {
  jobId: string;
  active: JobTab;
  counts: Partial<Record<JobTab, number>>;
}) {
  return (
    <nav aria-label="Job sections" className="overflow-x-auto border-b border-rule">
      <ul className="flex gap-6">
        {JOB_TABS.map((tab) => {
          const current = tab.value === active;
          const count = counts[tab.value];
          return (
            <li key={tab.value}>
              <Link
                href={tabHref(jobId, tab.value)}
                aria-current={current ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm ${
                  current ? "border-charcoal font-semibold text-charcoal" : "border-transparent text-ink-soft hover:text-charcoal"
                }`}
              >
                {tab.label}
                {count !== undefined ? <span className="text-xs text-ink-soft">{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

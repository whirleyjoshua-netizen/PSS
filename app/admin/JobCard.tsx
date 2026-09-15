import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { stageLabel, type Stage } from "@/lib/admin/stages";
import { isOverdue } from "@/lib/admin/overdue";
import { DaysInStage } from "./DaysInStage";

export function groupByStage(jobs: Job[], stages: readonly Stage[]) {
  return stages.map((stage) => ({
    stage,
    label: stageLabel(stage),
    jobs: jobs.filter((job) => job.status === stage),
  }));
}

export function JobCard({ job, now, href, selected = false }: {
  job: Job;
  now: Date;
  href: string;
  selected?: boolean;
}) {
  const overdue = isOverdue(job, now);
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`flex flex-col gap-1.5 rounded-lg border bg-ivory p-3 text-sm shadow-sm transition-shadow hover:shadow-md ${
        overdue ? "border-overdue/50" : "border-rule"
      } ${selected ? "outline outline-2 outline-offset-2 outline-champagne-ink" : ""}`}
    >
      <span className="text-base font-semibold text-charcoal">{job.name}</span>
      {job.referredBy ? (
        <span className="w-fit rounded border border-champagne-ink px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
          Referral
        </span>
      ) : null}
      <span className="flex items-center gap-1.5 text-ink-soft">
        <Icon name="pin" className="size-4 shrink-0" />
        {job.city}
      </span>
      {job.treatments.length ? <span className="text-ink-soft">{job.treatments.join(", ")}</span> : null}
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-ink-soft">
        <DaysInStage job={job} now={now} />
      </span>
    </Link>
  );
}

import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { STAGES, stageLabel, type Stage } from "@/lib/admin/stages";
import { daysInStage, isOverdue } from "@/lib/admin/overdue";

export function groupByStage(jobs: Job[], includeLost: boolean) {
  const stages: Stage[] = [...STAGES.map((s) => s.value), ...(includeLost ? (["lost"] as const) : [])];
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
  const days = daysInStage(job.stageChangedAt, now);
  const overdue = isOverdue(job, now);
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`flex flex-col gap-1 bg-ivory p-3 text-sm transition-colors hover:border-champagne-ink ${
        overdue ? "border-2 border-charcoal" : "border border-rule"
      } ${selected ? "outline outline-2 outline-offset-2 outline-charcoal" : ""}`}
    >
      <span className="font-display text-base text-charcoal">{job.name}</span>
      {job.referredBy ? (
        <span className="w-fit border border-champagne-ink px-1.5 font-display text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
          Referral
        </span>
      ) : null}
      <span className="text-ink-soft">{job.city}</span>
      {job.treatments.length ? <span className="text-ink-soft">{job.treatments.join(", ")}</span> : null}
      <span className="font-display text-xs uppercase tracking-[0.12em] text-champagne-ink">
        {days === 1 ? "1 day" : `${days} days`} in stage
        {overdue ? <strong className="ml-2 text-charcoal">· Overdue</strong> : null}
      </span>
    </Link>
  );
}

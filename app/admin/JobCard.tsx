import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { STAGES, stageLabel, type Stage } from "@/lib/admin/stages";

export function groupByStage(jobs: Job[], includeLost: boolean) {
  const stages: Stage[] = [...STAGES.map((s) => s.value), ...(includeLost ? (["lost"] as const) : [])];
  return stages.map((stage) => ({
    stage,
    label: stageLabel(stage),
    jobs: jobs.filter((job) => job.status === stage),
  }));
}

const daysSince = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));

export function JobCard({ job, now }: { job: Job; now: Date }) {
  const days = daysSince(job.stageChangedAt, now);
  return (
    <Link
      href={`/admin/jobs/${job.id}`}
      className="flex flex-col gap-1 border border-rule bg-ivory p-3 text-sm transition-colors hover:border-champagne-ink"
    >
      <span className="font-display text-base text-charcoal">{job.name}</span>
      <span className="text-ink-soft">{job.city}</span>
      {job.treatments.length ? <span className="text-ink-soft">{job.treatments.join(", ")}</span> : null}
      <span className="font-display text-xs uppercase tracking-[0.12em] text-champagne-ink">
        {days === 1 ? "1 day" : `${days} days`} in stage
      </span>
    </Link>
  );
}

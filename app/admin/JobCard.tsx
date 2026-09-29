import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { stageLabel, type Stage } from "@/lib/admin/stages";
import { roleLabel } from "@/lib/admin/team-roles";
import { isOverdue } from "@/lib/admin/overdue";
import { formatProjectNo } from "@/lib/portal/project-no";
import { DaysInStage } from "./DaysInStage";

export function groupByStage(jobs: Job[], stages: readonly Stage[]) {
  return stages.map((stage) => ({
    stage,
    label: stageLabel(stage),
    jobs: jobs.filter((job) => job.status === stage),
  }));
}

export function JobCard({ job, now }: { job: Job; now: Date }) {
  const overdue = isOverdue(job, now);
  return (
    <div
      className={`relative flex flex-col gap-1.5 rounded-lg border bg-ivory p-3 text-sm shadow-sm transition-shadow hover:shadow-md ${
        overdue ? "border-overdue/50" : "border-rule"
      }`}
    >
      {/* The name is the only link; its overlay makes the whole card clickable. */}
      <span className="text-base font-semibold text-charcoal">
        <Link
          href={`/admin/jobs/${job.id}`}
          className="underline-offset-4 after:absolute after:inset-0 hover:underline"
        >
          {job.name}
        </Link>
      </span>
      {formatProjectNo(job.projectNo) ? (
        <span className="font-mono text-xs text-ink-soft">{formatProjectNo(job.projectNo)}</span>
      ) : null}
      {job.referredBy ? (
        <span className="w-fit rounded border border-champagne-ink px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
          Referral
        </span>
      ) : null}
      {job.source === "service" ? (
        <span className="w-fit rounded border border-rule px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-ink-soft">
          Service
        </span>
      ) : null}
      <span className="flex items-center gap-1.5 text-ink-soft">
        <Icon name="pin" className="size-4 shrink-0" />
        {job.city}
      </span>
      {job.assignedName && job.assignedRole ? (
        <span className="text-ink-soft">{job.assignedName} · {roleLabel(job.assignedRole)}</span>
      ) : null}
      {job.treatments.length ? <span className="text-ink-soft">{job.treatments.join(", ")}</span> : null}
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-ink-soft">
        <DaysInStage job={job} now={now} />
      </span>
    </div>
  );
}

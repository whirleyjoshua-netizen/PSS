import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { stageLabel, type Stage } from "@/lib/admin/stages";
import { roleLabel } from "@/lib/admin/team-roles";
import { isOverdue } from "@/lib/admin/overdue";
import { DaysInStage } from "./DaysInStage";

export function groupByStage(jobs: Job[], stages: readonly Stage[]) {
  return stages.map((stage) => ({
    stage,
    label: stageLabel(stage),
    jobs: jobs.filter((job) => job.status === stage),
  }));
}

/** The card's one clickable target: its overlay stretches over the whole card. */
function JobLink({ href, className, name, selected = false }: {
  href: string;
  className: string;
  name: string;
  selected?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`${className} underline-offset-4 after:absolute after:inset-0 hover:underline`}
    >
      {name}
    </Link>
  );
}

export function JobCard({ job, now, href, selected = false }: {
  job: Job;
  now: Date;
  /** The desktop panel's URL. Phones ignore it and open the full page instead. */
  href: string;
  selected?: boolean;
}) {
  const overdue = isOverdue(job, now);
  return (
    <div
      className={`relative flex flex-col gap-1.5 rounded-lg border bg-ivory p-3 text-sm shadow-sm transition-shadow hover:shadow-md ${
        overdue ? "border-overdue/50" : "border-rule"
      } ${selected ? "outline outline-2 outline-offset-2 outline-champagne-ink" : ""}`}
    >
      {/* Two links, one shown per breakpoint: the panel is desktop-only, so phones go straight
          to the full job page. The hidden one is display:none, so it never reaches the a11y tree. */}
      <span className="text-base font-semibold text-charcoal">
        <JobLink href={`/admin/jobs/${job.id}`} className="lg:hidden" name={job.name} />
        <JobLink href={href} className="hidden lg:inline" name={job.name} selected={selected} />
      </span>
      {job.referredBy ? (
        <span className="w-fit rounded border border-champagne-ink px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
          Referral
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

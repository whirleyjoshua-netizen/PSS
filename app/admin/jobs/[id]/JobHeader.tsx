import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { editDetailsHref } from "@/lib/admin/next-action";
import { STAGE_STYLE, stageLabel } from "@/lib/admin/stages";
import { daysBetween, formatShortDate } from "@/lib/admin/time";
import { CallButton } from "./CallButton";
import { StageControls } from "./StageControls";
import { StageStepper } from "./StageStepper";
import { ACTION_LINK, TEXT_LINK } from "./ui";

function inStage(days: number): string {
  if (days === 0) return "In stage since today";
  return `${days} ${days === 1 ? "day" : "days"} in stage`;
}

export function JobHeader({ job, now }: { job: Job; now: Date }) {
  const style = STAGE_STYLE[job.status];

  return (
    <header className="flex flex-col gap-5">
      <Link href="/admin" className={`${TEXT_LINK} self-start`}>← All jobs</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-light">{job.name}</h1>
            <span className="inline-flex items-center gap-1.5 border border-rule bg-ivory px-2 py-1 text-xs uppercase tracking-wide">
              <Icon name={style.icon} className={`size-3.5 ${style.tint}`} />
              {stageLabel(job.status)}
            </span>
          </div>
          <p className="text-sm text-ink-soft">
            {[job.city, `Created ${formatShortDate(job.createdAt)}`, inStage(daysBetween(job.stageChangedAt, now))].join(" · ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CallButton jobId={job.id} name={job.name} phone={job.phone} />
          <a href={`sms:+1${job.phone}`} className={ACTION_LINK}>Text</a>
          {job.email ? <a href={`mailto:${job.email}`} className={ACTION_LINK}>Email</a> : null}
          <Link href={editDetailsHref(job.id, "visitAt")} className={ACTION_LINK}>Schedule</Link>
          <details className="relative">
            <summary aria-label="More actions" className={`${ACTION_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <span aria-hidden="true">•••</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] border border-rule bg-ivory p-4 shadow-lg">
              <StageControls job={job} parts={["set", "lost"]} />
            </div>
          </details>
        </div>
      </div>

      {job.status === "lost" ? (
        <p className="border-l-4 border-taupe bg-ivory px-4 py-3 text-sm">
          {job.lostReason ? `Lost — ${job.lostReason}` : "Lost"}
        </p>
      ) : null}

      <StageStepper status={job.status} />
    </header>
  );
}

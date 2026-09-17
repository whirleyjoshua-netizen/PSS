import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";
import type { Job } from "@/lib/admin/jobs";
import type { TeamMember } from "@/lib/admin/team";
import { STAGE_STYLE, stageLabel } from "@/lib/admin/stages";
import { daysBetween, formatShortDate, formatShortDay } from "@/lib/admin/time";
import { formatProjectNo } from "@/lib/portal/project-no";
import { AssignControl } from "./AssignControl";
import { CallButton } from "./CallButton";
import { ContactLog } from "./ContactLog";
import { DeleteJob } from "./DeleteJob";
import { FollowUpBox } from "./FollowUpBox";
import { ScheduleDialog } from "./ScheduleDialog";
import { StageControls } from "./StageControls";
import { StageStepper } from "./StageStepper";
import { ACTION_LINK, TEXT_LINK } from "./ui";

function inStage(days: number): string {
  if (days === 0) return "In stage since today";
  return `${days} ${days === 1 ? "day" : "days"} in stage`;
}

export function JobHeader({ job, now, team, defaultMinutes, parent = null, deleteBlocked = false }: {
  job: Job;
  now: Date;
  team: TeamMember[];
  defaultMinutes: Record<AppointmentKind, number>;
  /** The job this one came from, when a customer's service request created it. */
  parent?: Job | null;
  /** A delete was refused because this job has a service request against it. */
  deleteBlocked?: boolean;
}) {
  const style = STAGE_STYLE[job.status];

  return (
    <header className="flex flex-col gap-5">
      <Link href="/admin" className={`${TEXT_LINK} self-start`}>← All jobs</Link>

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-light">{job.name}</h1>
            <span className="inline-flex items-center gap-1.5 border border-rule bg-ivory px-2 py-1 text-xs uppercase tracking-wide">
              <Icon name={style.icon} className={`size-3.5 ${style.tint}`} />
              {stageLabel(job.status)}
            </span>
            {job.followUpAt && job.followUpAt.getTime() < now.getTime() ? (
              <span className="border border-overdue px-2 py-1 text-xs font-semibold uppercase tracking-wide text-overdue">Call-back overdue</span>
            ) : null}
          </div>
          <p className="text-sm text-ink-soft">
            {[job.city, `Created ${formatShortDate(job.createdAt)}`, inStage(daysBetween(job.stageChangedAt, now))].join(" · ")}
          </p>
          {parent ? (
            <p className="text-sm">
              <Link href={`/admin/jobs/${parent.id}`} className={TEXT_LINK}>
                Service request for {formatProjectNo(parent.projectNo) ?? parent.name}
              </Link>
            </p>
          ) : null}
          {job.lastContactAt ? (
            <p className="text-sm text-ink-soft">Last contacted {formatShortDay(job.lastContactAt)}</p>
          ) : null}
          <AssignControl jobId={job.id} assignedTo={job.assignedTo ?? null} team={team} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CallButton jobId={job.id} name={job.name} phone={job.phone} />
          <a href={`sms:+1${job.phone}`} className={ACTION_LINK}>Text</a>
          {job.email ? <a href={`mailto:${job.email}`} className={ACTION_LINK}>Email</a> : null}
          <ScheduleDialog jobId={job.id} defaultMinutes={defaultMinutes} />
          <details className="sm:relative">
            <summary aria-label="More actions" className={`${ACTION_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <span aria-hidden="true">•••</span>
            </summary>
            <div className="absolute inset-x-0 z-20 mt-2 border border-rule bg-ivory p-4 shadow-lg sm:left-auto sm:right-0 sm:w-80">
              <div className="flex flex-col gap-4">
                <ContactLog jobId={job.id} />
                <hr className="border-rule" />
                <FollowUpBox
                  key={job.followUpAt?.toISOString() ?? "none"}
                  job={{ id: job.id, followUpAt: job.followUpAt ?? null, followUpNote: job.followUpNote ?? null }}
                />
                <hr className="border-rule" />
                <details>
                  <summary className="cursor-pointer text-sm underline underline-offset-4">Change stage…</summary>
                  <div className="mt-3">
                    <StageControls job={job} parts={["set", "lost"]} />
                  </div>
                </details>
                {/* Below the rule, after everything else: the reversible actions stay
                    together above and the one irreversible action sits apart. */}
                <hr className="border-rule" />
                <DeleteJob
                  job={{ id: job.id, name: job.name, projectNo: formatProjectNo(job.projectNo) }}
                  blocked={deleteBlocked}
                />
              </div>
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

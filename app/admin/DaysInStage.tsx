import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { daysInStage, isOverdue } from "@/lib/admin/overdue";

/** The clock icon plus "N days in stage", with an Overdue flag when applicable. */
export function DaysInStage({ job, now }: { job: Job; now: Date }) {
  const days = daysInStage(job.stageChangedAt, now);
  const overdue = isOverdue(job, now);
  return (
    <>
      <Icon name="clock" className="size-4 shrink-0" />
      {days === 1 ? "1 day" : `${days} days`} in stage
      {overdue ? <strong className="font-semibold uppercase text-overdue">· Overdue</strong> : null}
    </>
  );
}

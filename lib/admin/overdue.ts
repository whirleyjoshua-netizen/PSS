import type { Job } from "./jobs";
import type { Stage } from "./stages";
import { lasVegasDate } from "./time";

/** Days a job may sit in a stage before the board flags it. Stages absent here never go overdue. */
export const OVERDUE_DAYS: Partial<Record<Stage, number>> = {
  new: 1,
  quoted: 7,
  sold: 3,
  ordered: 21,
};

export const daysInStage = (stageChangedAt: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - stageChangedAt.getTime()) / 86_400_000));

/** A booked visit is judged by its date, not by time in stage: overdue once its Las Vegas day has passed. */
export function isOverdue(job: Pick<Job, "status" | "stageChangedAt" | "visitAt">, now: Date): boolean {
  if (job.status === "visit_booked") {
    return job.visitAt !== null && lasVegasDate(now) > lasVegasDate(job.visitAt);
  }
  const limit = OVERDUE_DAYS[job.status];
  return limit !== undefined && daysInStage(job.stageChangedAt, now) > limit;
}

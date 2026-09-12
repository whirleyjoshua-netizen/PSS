import type { Job } from "@/lib/admin/jobs";
import { lasVegasDate } from "@/lib/admin/time";

export const REVIEW_WINDOW_DAYS = 14;

export type ReviewCandidate = Pick<
  Job, "status" | "email" | "reviewRequestedAt" | "reviewOptOut" | "installOn" | "stageChangedAt"
>;

export const installDate = (job: ReviewCandidate): string =>
  job.installOn ?? lasVegasDate(job.stageChangedAt);

/** YYYY-MM-DD strings compare correctly as text, so no Date math is needed past this. */
function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Whether the daily run should email this job today. */
export function isDueForReview(job: ReviewCandidate, now: Date): boolean {
  if (job.status !== "installed" || !job.email || job.reviewRequestedAt || job.reviewOptOut) return false;
  const today = lasVegasDate(now);
  const installed = installDate(job);
  return installed < today && installed >= daysBefore(today, REVIEW_WINDOW_DAYS);
}

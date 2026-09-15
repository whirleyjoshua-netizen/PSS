import type { Job } from "@/lib/admin/jobs";
import { isInstalled } from "@/lib/admin/stages";
import { lasVegasDate } from "@/lib/admin/time";

export const REVIEW_WINDOW_DAYS = 14;

export type ReviewCandidate = Pick<
  Job, "status" | "email" | "reviewRequestedAt" | "reviewOptOut" | "installOn" | "stageChangedAt"
>;

/**
 * The install date the owners entered, else the day the job moved to Installed.
 * The fallback applies only while the job is still Installed: once it is
 * Completed, stage_changed_at is the completion day, not the install day.
 */
export const installDate = (job: ReviewCandidate): string | null =>
  job.installOn ?? (job.status === "installed" ? lasVegasDate(job.stageChangedAt) : null);

/** YYYY-MM-DD strings compare correctly as text, so no Date math is needed past this. */
function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Whether the daily run should email this job today. */
export function isDueForReview(job: ReviewCandidate, now: Date): boolean {
  if (!isInstalled(job.status) || !job.email || job.reviewRequestedAt || job.reviewOptOut) return false;
  const today = lasVegasDate(now);
  const installed = installDate(job);
  if (!installed) return false;
  return installed < today && installed >= daysBefore(today, REVIEW_WINDOW_DAYS);
}

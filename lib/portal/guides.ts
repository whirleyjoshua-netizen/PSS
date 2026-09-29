import { isInstalled } from "@/lib/admin/stages";

const ORDERED_OR_LATER: readonly string[] = ["ordered", "installed", "completed"];

/**
 * Spec §7: "Getting ready for your install" from the moment an install is booked (a confirmed
 * install appointment, or an install date) or the job is Ordered or later; "Caring for your
 * shades" once Installed or Completed. A Lost job shows neither.
 */
export function guidesToShow(job: { status: string; installOn?: string | null }, installAppointmentAt: Date | null): { install: boolean; care: boolean } {
  if (job.status === "lost") return { install: false, care: false };
  return {
    install: installAppointmentAt !== null || Boolean(job.installOn) || ORDERED_OR_LATER.includes(job.status),
    care: isInstalled(job.status),
  };
}

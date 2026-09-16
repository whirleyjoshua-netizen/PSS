import "server-only";
import { db } from "@/lib/db";
import { JOB_COLUMNS, toJob, type Job } from "@/lib/admin/jobs";
import { buildSteps, PORTAL_STATUSES, toPortalStage, type PortalStage, type ProjectStep, type StepInput } from "./progress";
import { formatProjectNo } from "./project-no";
import type { Finish } from "@/lib/leads/finish";
import type { TreatmentType } from "@/lib/leads/treatment-types";

export const normalizeEmail = (raw: string | null | undefined): string => (raw ?? "").trim().toLowerCase();

/**
 * The one definition of which jobs a customer email may see: its own jobs,
 * from Quoted onward (Completed shows as Installed), never Lost. Sign-in,
 * every customer page and the photo route all go through here.
 */
export async function visibleJobs(rawEmail: string): Promise<Job[]> {
  const email = normalizeEmail(rawEmail);
  if (!email) return [];
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where lower(trim(email)) = $1 and status = any($2::text[])
     order by created_at desc`,
    [email, [...PORTAL_STATUSES]],
  );
  return rows.map(toJob);
}

/** What a customer page may render. Deliberately has no money, notes or contact fields. */
export type ProjectSummary = {
  id: string;
  firstName: string;
  address: string | null;
  city: string;
  status: PortalStage;
  installOn: string | null;
  /** Already formatted as PSS-1048; the internal id never appears here. */
  projectNo: string | null;
  /** The customer's own order: what they are buying, not what it cost. */
  windowCount: number | null;
  treatmentTypes: TreatmentType[];
  finish: Finish | null;
  orderedOn: string | null;
  /** Dates only — see buildSteps. No event body can reach a step. */
  steps: ProjectStep[];
};

/** The dated facts the steps need, which the page loads alongside the job. */
export type Timeline = Pick<StepInput, "lastMeasuredAt" | "stageDates" | "installAppointmentAt">;

/** Only call with a job from visibleJobs(), so its status is a portal status. */
export function toProject(job: Job, timeline: Timeline = {}): ProjectSummary {
  return {
    id: job.id,
    firstName: job.name.trim().split(/\s+/)[0],
    address: job.address,
    city: job.city,
    status: toPortalStage(job.status),
    installOn: job.installOn,
    projectNo: formatProjectNo(job.projectNo ?? null),
    windowCount: job.windowCountExact ?? null,
    treatmentTypes: job.treatmentTypes ?? [],
    finish: job.finish ?? null,
    orderedOn: job.orderedOn,
    steps: buildSteps({
      ...timeline,
      status: job.status,
      visitAt: job.visitAt,
      orderedOn: job.orderedOn,
      installOn: job.installOn,
    }),
  };
}

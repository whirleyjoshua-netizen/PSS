import "server-only";
import { db } from "@/lib/db";
import { JOB_COLUMNS, toJob, type Job } from "@/lib/admin/jobs";
import { PORTAL_STATUSES, toPortalStage, type PortalStage } from "./progress";

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
};

/** Only call with a job from visibleJobs(), so its status is a portal status. */
export function toProject(job: Job): ProjectSummary {
  return {
    id: job.id,
    firstName: job.name.trim().split(/\s+/)[0],
    address: job.address,
    city: job.city,
    status: toPortalStage(job.status),
    installOn: job.installOn,
  };
}

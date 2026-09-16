import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { isStage, type Stage } from "@/lib/admin/stages";

/**
 * The first time each status was reached, for the customer's step dates.
 *
 * job_events also holds the owners' internal notes in its `body` column, so this query
 * selects the status and the time and nothing else. No body column may appear here — a
 * test asserts it on the statement itself. Nothing else about events reaches the portal.
 */
export async function stageDates(jobId: string): Promise<Partial<Record<Stage, Date>>> {
  if (!isUuid(jobId)) return {};
  const rows = await db()`
    select to_status, created_at from job_events
    where lead_id = ${jobId} and kind = 'stage' and to_status is not null
    order by created_at`;

  const dates: Partial<Record<Stage, Date>> = {};
  for (const row of rows) {
    const status = row.to_status;
    // Oldest first, so the first row for a status is the one that counts. Retired
    // statuses that old entries still mention are skipped.
    if (isStage(status) && !dates[status]) dates[status] = new Date(row.created_at as string | Date);
  }
  return dates;
}

/**
 * When the job was last measured, for the Measurements step.
 *
 * window_measurements holds the owners' own notes and room labels, so this selects
 * the time and nothing else.
 */
export async function lastMeasuredAt(jobId: string): Promise<Date | null> {
  if (!isUuid(jobId)) return null;
  const rows = await db()`select max(created_at) as at from window_measurements where lead_id = ${jobId}`;
  const at = rows[0]?.at as string | Date | null | undefined;
  return at ? new Date(at) : null;
}

/**
 * The confirmed install appointment for each of several jobs, in one query.
 *
 * The list of a customer's projects needs each row's current step, and a confirmed install
 * appointment is the only fact deciding it that the job row does not already carry. Batching
 * it keeps a list of N projects at one round trip instead of N. Same whitelist as
 * installAppointmentAt: the time and nothing else, and an unconfirmed booking never counts.
 */
export async function confirmedInstallAppointments(jobIds: string[]): Promise<Map<string, Date>> {
  const ids = jobIds.filter(isUuid);
  if (ids.length === 0) return new Map();
  const rows = await db().query(
    `select lead_id, max(starts_at) as starts_at from appointments
     where lead_id = any($1::uuid[]) and kind = 'install' and confirmed_at is not null
     group by lead_id`,
    [ids],
  );

  const byJob = new Map<string, Date>();
  for (const row of rows) {
    const at = row.starts_at as string | Date | null | undefined;
    if (at) byJob.set(String(row.lead_id), new Date(at));
  }
  return byJob;
}

/**
 * The confirmed install appointment, for the Ready to Install step. An unconfirmed
 * booking is the owners' own pencilling-in and never reaches the customer.
 */
export async function installAppointmentAt(jobId: string): Promise<Date | null> {
  if (!isUuid(jobId)) return null;
  const rows = await db()`
    select starts_at from appointments
    where lead_id = ${jobId} and kind = 'install' and confirmed_at is not null
    order by starts_at desc limit 1`;
  const at = rows[0]?.starts_at as string | Date | null | undefined;
  return at ? new Date(at) : null;
}

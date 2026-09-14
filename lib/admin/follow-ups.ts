import "server-only";
import { db } from "@/lib/db";
import { formatFollowUp, endOfTodayLasVegas } from "./follow-up";
import { JOB_COLUMNS, isUuid, toJob, type Job } from "./jobs";

/** Sets (or replaces) the job's next follow-up and logs it, in one statement. */
export async function setFollowUp(jobId: string, at: Date, note: string | null, actor: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const rows = await db().query(
    `with changed as (
       update leads set follow_up_at = $2, follow_up_note = $3, updated_at = now()
       where id = $1
       returning id
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $4, 'note', $5 from changed
     returning id`,
    [jobId, at, note, actor, `Follow-up set: ${formatFollowUp(at, note)}`],
  );
  return rows.length > 0;
}

/** Clears a set follow-up and logs it. False if there was none (or no such job). */
export async function clearFollowUp(jobId: string, actor: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const rows = await db().query(
    `with changed as (
       update leads set follow_up_at = null, follow_up_note = null, updated_at = now()
       where id = $1 and follow_up_at is not null
       returning id
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $2, 'note', $3 from changed
     returning id`,
    [jobId, actor, "Follow-up done"],
  );
  return rows.length > 0;
}

/** Jobs (not Lost) whose follow-up is before the end of today in Las Vegas, soonest first. */
export async function listDueFollowUps(now: Date): Promise<Job[]> {
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where follow_up_at is not null and status <> 'lost' and follow_up_at < $1
     order by follow_up_at asc`,
    [endOfTodayLasVegas(now)],
  );
  return rows.map(toJob);
}

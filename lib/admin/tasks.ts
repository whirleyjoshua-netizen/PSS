import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "./ids";
import { parseAllowlist } from "./allowlist";
import { listAddedAdmins } from "./admin-access";
import { DONE_VISIBLE_DAYS, REMIND_COOLDOWN_MINUTES, type Task, type TaskStatus } from "./task-rules";
import type { TaskInput } from "./task-schema";
import type { StoredUpload } from "./task-files";

const at = (value: unknown): Date | null => (value === null || value === undefined ? null : new Date(value as string));

function toTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    notes: (row.notes as string | null) ?? null,
    status: row.status as TaskStatus,
    assigneeEmail: (row.assignee_email as string | null) ?? null,
    dueOn: (row.due_on as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string),
    completedAt: at(row.completed_at),
    lastRemindedAt: at(row.last_reminded_at),
    lastRemindedBy: (row.last_reminded_by as string | null) ?? null,
    fileCount: Number(row.file_count ?? 0),
  };
}

const owners = () => parseAllowlist(process.env.ADMIN_EMAILS);

/** Everyone who can sign in: the people a task can be assigned to. */
export async function assignableEmails(): Promise<string[]> {
  const added = (await listAddedAdmins()).map((admin) => admin.email);
  return [...new Set([...owners(), ...added])].sort();
}

export async function listTasks(): Promise<Task[]> {
  const rows = await db()`
    select id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
           completed_at, last_reminded_at, last_reminded_by,
           (select count(*) from task_files f where f.task_id = tasks.id)::int as file_count
    from tasks
    where status <> 'done' or completed_at > now() - make_interval(days => ${DONE_VISIBLE_DAYS}::int)
    order by created_at`;
  return rows.map(toTask);
}

export async function getTask(id: string): Promise<Task | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`
    select id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
           completed_at, last_reminded_at, last_reminded_by,
           (select count(*) from task_files f where f.task_id = tasks.id)::int as file_count
    from tasks where id = ${id}`;
  return rows[0] ? toTask(rows[0]) : null;
}

/** What a new task is saved with: the id the form made, and the files picked on it. */
export type NewTaskFiles = { id: string; uploads: StoredUpload[]; resourceIds: string[] };

/**
 * One statement writes the task and its files, so the assignment email can list them all.
 * The assignee is checked inside the insert, so a stale tab can't assign someone already removed
 * (a save racing a removal in the same instant is not prevented). The id comes from the form:
 * a repeat submit finds it taken and answers created: false, writing nothing.
 * Throws 23503 when a picked Resources file was deleted, and then nothing is written.
 */
export async function createTask(
  input: TaskInput, actor: string, files: NewTaskFiles,
): Promise<{ id: string; created: boolean; fileNames: string[] } | "not-assignable"> {
  const a = input.assignee;
  const uploads = JSON.stringify(files.uploads.map((u) => ({
    id: u.id, name: u.name, content_type: u.contentType, size_bytes: u.sizeBytes, blob_pathname: u.pathname,
  })));
  const [row] = await db()`
    with allowed as (
      select (${a}::text is null or ${a}::text = any(${owners()}::text[])
              or exists (select 1 from admin_access where email = ${a}::text)) as ok
    ), ins as (
      insert into tasks (id, title, notes, status, assignee_email, due_on, created_by, completed_at)
      select ${files.id}::uuid, ${input.title}::text, ${input.notes}::text, ${input.status}::text, ${a}::text, ${input.dueOn}::date, ${actor}::text,
             case when ${input.status}::text = 'done' then now() end
      where (select ok from allowed)
      on conflict (id) do nothing
      returning id
    ), ups as (
      insert into task_files (id, task_id, name, content_type, size_bytes, blob_pathname, added_by)
      select u.id, ins.id, u.name, u.content_type, u.size_bytes, u.blob_pathname, ${actor}::text
      from ins, jsonb_to_recordset(${uploads}::jsonb) as u(id uuid, name text, content_type text, size_bytes bigint, blob_pathname text)
      returning name
    ), links as (
      insert into task_files (id, task_id, resource_id, added_by)
      select gen_random_uuid(), ins.id, r.id, ${actor}::text
      from ins, unnest(${files.resourceIds}::uuid[]) as r(id)
      returning resource_id
    )
    select exists (select 1 from tasks where id = ${files.id}::uuid) as existed, (select ok from allowed) as allowed,
           exists (select 1 from ins) as created,
           array(select name from ups order by name) || array(select c.name from company_files c join links l on l.resource_id = c.id order by c.name) as file_names`;
  // The statement's snapshot predates its own insert, so "existed" means an earlier save took this id.
  if (row?.existed) return { id: files.id, created: false, fileNames: [] };
  if (!row?.allowed) return "not-assignable";
  return { id: files.id, created: Boolean(row.created), fileNames: (row.file_names as string[] | null) ?? [] };
}

/**
 * One statement: reads the previous assignee (for the assignment email) and writes. Keeping the
 * current assignee is always allowed, so a done task's history survives that person losing access.
 */
export async function updateTask(
  id: string,
  input: TaskInput,
): Promise<{ previousAssignee: string | null } | "missing" | "not-assignable"> {
  if (!isUuid(id)) return "missing";
  const a = input.assignee;
  const [row] = await db()`
    with prev as (
      select assignee_email from tasks where id = ${id}
    ), allowed as (
      select (${a}::text is null or ${a}::text = any(${owners()}::text[])
              or exists (select 1 from admin_access where email = ${a}::text)
              or ${a}::text is not distinct from (select assignee_email from prev)) as ok
    ), updated as (
      update tasks set
        title = ${input.title}::text, notes = ${input.notes}::text, status = ${input.status}::text,
        assignee_email = ${a}::text, due_on = ${input.dueOn}::date,
        completed_at = case when ${input.status}::text = 'done' then case when status = 'done' then completed_at else now() end end,
        updated_at = now()
      where id = ${id} and (select ok from allowed)
      returning id
    )
    select exists (select 1 from prev) as found, (select ok from allowed) as allowed,
           exists (select 1 from updated) as updated, (select assignee_email from prev) as previous_assignee`;
  if (!row?.found) return "missing";
  if (!row.allowed) return "not-assignable";
  // Allowed but nothing updated: the task was deleted between the read and the write.
  if (!row.updated) return "missing";
  return { previousAssignee: (row.previous_assignee as string | null) ?? null };
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    update tasks set status = ${status}::text, updated_at = now(),
      completed_at = case when ${status}::text = 'done' then case when status = 'done' then completed_at else now() end end
    where id = ${id}
    returning id`;
  return rows.length > 0;
}

/**
 * Deletes the task; its file rows go with it (on delete cascade). Answers the storage paths of its
 * uploads so the caller removes those files, or null when the task was already gone. The paths are read
 * in the same statement, whose snapshot predates the cascade.
 */
export async function deleteTask(id: string): Promise<string[] | null> {
  if (!isUuid(id)) return null;
  const [row] = await db()`
    with paths as (
      select blob_pathname from task_files where task_id = ${id} and blob_pathname is not null
    ), gone as (
      delete from tasks where id = ${id} returning id
    )
    select exists (select 1 from gone) as deleted, array(select blob_pathname from paths order by blob_pathname) as paths`;
  return row?.deleted ? ((row.paths as string[] | null) ?? []) : null;
}

/** Timestamps travel as Postgres text so restoring one is exact to the microsecond. */
export type ReminderClaim = { task: Task; claimedAt: string; previousAt: string | null; previousBy: string | null };

/**
 * Takes the reminder slot in one statement. Two presses at once: Postgres re-checks the second
 * update's where clause after the first commits, so only one claims and only one email goes out.
 */
export async function claimReminder(
  id: string,
  actor: string,
): Promise<{ claim: ReminderClaim } | { refused: "missing" | "done" | "unassigned" | "recent"; lastAt: Date | null }> {
  if (!isUuid(id)) return { refused: "missing", lastAt: null };
  const [row] = await db()`
    with prev as (
      select status, assignee_email, last_reminded_at, last_reminded_at::text as at_text, last_reminded_by
      from tasks where id = ${id}
    ), claimed as (
      update tasks set last_reminded_at = now(), last_reminded_by = ${actor}::text
      where id = ${id} and assignee_email is not null and status <> 'done'
        and (last_reminded_at is null or last_reminded_at < now() - make_interval(mins => ${REMIND_COOLDOWN_MINUTES}::int))
      returning id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
                completed_at, last_reminded_at, last_reminded_by, last_reminded_at::text as claimed_at
    )
    select p.status as prev_status, p.assignee_email as prev_assignee, p.last_reminded_at as prev_at,
           p.at_text as prev_at_text, p.last_reminded_by as prev_by,
           p.last_reminded_at >= now() - make_interval(mins => ${REMIND_COOLDOWN_MINUTES}::int) as prev_recent, c.*
    from prev p left join claimed c on true`;
  if (!row) return { refused: "missing", lastAt: null };
  if (!row.id) {
    if (row.prev_status === "done") return { refused: "done", lastAt: null };
    if (!row.prev_assignee) return { refused: "unassigned", lastAt: null };
    // A simultaneous press won: this statement's snapshot predates it, so its time (if any) is
    // old. Show the time only when it is inside the cooldown; otherwise null ("a moment ago").
    return { refused: "recent", lastAt: row.prev_recent ? at(row.prev_at) : null };
  }
  return {
    claim: {
      task: toTask(row),
      claimedAt: row.claimed_at as string,
      previousAt: (row.prev_at_text as string | null) ?? null,
      previousBy: (row.prev_by as string | null) ?? null,
    },
  };
}

/** Undoes a claim whose email failed, unless someone has reminded since. */
export async function releaseReminder(id: string, claim: ReminderClaim): Promise<void> {
  await db()`
    update tasks set last_reminded_at = ${claim.previousAt}::timestamptz, last_reminded_by = ${claim.previousBy}::text
    where id = ${id} and last_reminded_at = ${claim.claimedAt}::timestamptz`;
}

/** For the morning digest: `through` is tomorrow's Las Vegas date. */
export async function listDigestTasks(through: string): Promise<Task[]> {
  const rows = await db()`
    select id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
           completed_at, last_reminded_at, last_reminded_by
    from tasks
    where status <> 'done' and assignee_email is not null and due_on <= ${through}::date
    order by assignee_email, due_on, created_at`;
  return rows.map(toTask);
}

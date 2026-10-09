import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "./ids";
import type { TaskFile } from "./task-file-rules";

/**
 * The task_files rows (migration 043). The unit tests pin this SQL's text only;
 * scripts/verify-task-files.ts runs it against a real database.
 */

/** A file uploaded to a task and checked in storage, ready to record. */
export type StoredUpload = { id: string; name: string; contentType: string; sizeBytes: number; pathname: string };

function toTaskFile(row: Record<string, unknown>): TaskFile {
  return {
    id: row.id as string, taskId: row.task_id as string, resourceId: (row.resource_id as string | null) ?? null,
    name: row.name as string, contentType: row.content_type as string, sizeBytes: Number(row.size_bytes),
    addedBy: row.added_by as string, createdAt: new Date(row.created_at as string),
  };
}

/** Uploads and links together, oldest first. A link shows the library file's current name, type and size. */
export async function listTaskFiles(taskId: string): Promise<TaskFile[]> {
  if (!isUuid(taskId)) return [];
  const rows = await db()`
    select f.id, f.task_id, f.resource_id, coalesce(f.name, r.name) as name, coalesce(f.content_type, r.content_type) as content_type,
           coalesce(f.size_bytes, r.size_bytes) as size_bytes, f.added_by, f.created_at
    from task_files f left join company_files r on r.id = f.resource_id
    where f.task_id = ${taskId}
    order by f.created_at, f.id`;
  return rows.map(toTaskFile);
}

/** One attachment with its storage path (null for a link), for opening it. */
export async function getTaskFile(id: string): Promise<(TaskFile & { pathname: string | null }) | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`
    select f.id, f.task_id, f.resource_id, coalesce(f.name, r.name) as name, coalesce(f.content_type, r.content_type) as content_type,
           coalesce(f.size_bytes, r.size_bytes) as size_bytes, f.added_by, f.created_at, f.blob_pathname
    from task_files f left join company_files r on r.id = f.resource_id
    where f.id = ${id}`;
  return rows[0] ? { ...toTaskFile(rows[0]), pathname: (rows[0].blob_pathname as string | null) ?? null } : null;
}

/**
 * Records an upload. A second save of the same upload (a retry, a double click) changes nothing and
 * answers "exists". Throws 23503 when the task was deleted while the file uploaded.
 */
export async function addTaskUpload(taskId: string, upload: StoredUpload, addedBy: string): Promise<"added" | "exists"> {
  const rows = await db()`
    insert into task_files (id, task_id, name, content_type, size_bytes, blob_pathname, added_by)
    values (${upload.id}, ${taskId}, ${upload.name}, ${upload.contentType}, ${upload.sizeBytes}, ${upload.pathname}, ${addedBy})
    on conflict do nothing
    returning id`;
  return rows.length > 0 ? "added" : "exists";
}

/** Links a Resources file. Already linked answers "exists". Throws 23503 when the task or the file is gone. */
export async function linkResource(taskId: string, resourceId: string, addedBy: string): Promise<"added" | "exists"> {
  const rows = await db()`
    insert into task_files (id, task_id, resource_id, added_by)
    values (gen_random_uuid(), ${taskId}, ${resourceId}, ${addedBy})
    on conflict do nothing
    returning id`;
  return rows.length > 0 ? "added" : "exists";
}

/** Deletes the row; answers its storage path (null for a link) so the caller removes the file, or null if already gone. */
export async function removeTaskFile(taskId: string, fileId: string): Promise<{ pathname: string | null } | null> {
  if (!isUuid(taskId) || !isUuid(fileId)) return null;
  const rows = await db()`delete from task_files where id = ${fileId} and task_id = ${taskId} returning blob_pathname`;
  return rows[0] ? { pathname: (rows[0].blob_pathname as string | null) ?? null } : null;
}

/** Which of these storage paths a row records. */
export async function recordedPathnames(paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const rows = await db()`select blob_pathname from task_files where blob_pathname = any(${paths}::text[])`;
  return new Set(rows.map((r) => r.blob_pathname as string));
}

import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "./ids";
import type { Resource } from "./resource-rules";

/**
 * The Resources library's rows (migration 036). The unit tests pin this SQL's text only;
 * scripts/verify-resources.ts runs it against a real database.
 */

function toResource(row: Record<string, unknown>): Resource {
  return {
    id: row.id as string, name: row.name as string, category: row.category as string,
    contentType: row.content_type as string, sizeBytes: Number(row.size_bytes),
    uploadedBy: row.uploaded_by as string, createdAt: new Date(row.created_at as string),
  };
}

export async function listResources(): Promise<Resource[]> {
  const rows = await db()`
    select id, name, category, content_type, size_bytes, uploaded_by, created_at from company_files order by category, name`;
  return rows.map(toResource);
}

export async function listCategories(): Promise<string[]> {
  const rows = await db()`select distinct category from company_files order by category`;
  return rows.map((r) => r.category as string);
}

export async function getResource(id: string): Promise<(Resource & { pathname: string }) | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`
    select id, name, category, content_type, size_bytes, uploaded_by, created_at, blob_pathname from company_files where id = ${id}`;
  return rows[0] ? { ...toResource(rows[0]), pathname: rows[0].blob_pathname as string } : null;
}

export async function createResource(input: {
  id: string; name: string; category: string; contentType: string; sizeBytes: number; pathname: string; uploadedBy: string;
}): Promise<Resource | null> {
  // A second save of the same upload (a retry, a double click) changes nothing and answers null:
  // the caller must not treat it as a failure and delete the file the first save recorded.
  const [row] = await db()`
    insert into company_files (id, name, category, content_type, size_bytes, blob_pathname, uploaded_by)
    values (${input.id}, ${input.name}, ${input.category}, ${input.contentType}, ${input.sizeBytes}, ${input.pathname}, ${input.uploadedBy})
    on conflict do nothing
    returning id, name, category, content_type, size_bytes, uploaded_by, created_at`;
  return row ? toResource(row) : null;
}

export async function renameResource(id: string, name: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`update company_files set name = ${name}, updated_at = now() where id = ${id} returning id`;
  return rows.length > 0;
}

export async function recategorizeResource(id: string, category: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`update company_files set category = ${category}, updated_at = now() where id = ${id} returning id`;
  return rows.length > 0;
}

/** Deletes the row; answers its storage path so the caller removes the file, or null if it was already gone. */
export async function deleteResource(id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`delete from company_files where id = ${id} returning blob_pathname`;
  return (rows[0]?.blob_pathname as string | undefined) ?? null;
}

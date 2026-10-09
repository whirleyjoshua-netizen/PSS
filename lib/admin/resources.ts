import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "./ids";
import { UNCATEGORIZED, type Category, type ListedResource, type Resource } from "./resource-rules";

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

/** Each file with how many tasks link to it (migration 043), so Delete can say they'll lose it. */
export async function listResources(): Promise<ListedResource[]> {
  const rows = await db()`
    select id, name, category, content_type, size_bytes, uploaded_by, created_at,
           (select count(*) from task_files t where t.resource_id = company_files.id)::int as task_count
    from company_files order by category, name`;
  return rows.map((row) => ({ ...toResource(row), taskCount: Number(row.task_count ?? 0) }));
}

/** Every category (migration 041) with how many files it holds, Uncategorized included. */
export async function listCategories(): Promise<Category[]> {
  const rows = await db()`
    select c.name, count(f.id)::int as file_count
    from resource_categories c left join company_files f on f.category = c.name
    group by c.name order by c.name`;
  return rows.map((r) => ({ name: r.name as string, fileCount: Number(r.file_count) }));
}

/** Adds an empty category. False when one by that name exists already, whatever its case. */
export async function createCategory(name: string): Promise<boolean> {
  const rows = await db()`insert into resource_categories (name) values (${name}) on conflict do nothing returning name`;
  return rows.length > 0;
}

/**
 * Renames a category; its files follow (on update cascade). False when `from` is gone or is Uncategorized.
 * Throws 23505 when another category already has the new name.
 */
export async function renameCategory(from: string, to: string): Promise<boolean> {
  const rows = await db()`
    update resource_categories set name = ${to} where name = ${from} and name <> ${UNCATEGORIZED} returning name`;
  return rows.length > 0;
}

/** Deletes a category; its files drop to Uncategorized (on delete set default). False when gone or Uncategorized. */
export async function deleteCategory(name: string): Promise<boolean> {
  const rows = await db()`delete from resource_categories where name = ${name} and name <> ${UNCATEGORIZED} returning name`;
  return rows.length > 0;
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

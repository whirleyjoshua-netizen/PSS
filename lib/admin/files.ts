import "server-only";
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { db } from "@/lib/db";
import { safeName, type FileKind } from "./uploads";

export type JobFile = {
  id: string;
  leadId: string;
  createdAt: Date;
  uploadedBy: string;
  kind: FileKind;
  name: string;
  contentType: string;
  sizeBytes: number;
  blobPathname: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toFile(row: Record<string, unknown>): JobFile {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    createdAt: new Date(row.created_at as string),
    uploadedBy: row.uploaded_by as string,
    kind: row.kind as FileKind,
    name: row.name as string,
    contentType: row.content_type as string,
    sizeBytes: Number(row.size_bytes),
    blobPathname: row.blob_pathname as string,
  };
}

export async function listFiles(leadId: string): Promise<JobFile[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`select * from job_files where lead_id = ${leadId} order by created_at desc`;
  return rows.map(toFile);
}

export async function getFile(fileId: string): Promise<JobFile | null> {
  if (!UUID.test(fileId)) return null;
  const rows = await db()`select * from job_files where id = ${fileId}`;
  return rows[0] ? toFile(rows[0]) : null;
}

/**
 * Stores the bytes privately, then records the file and its event in one
 * statement. If the row cannot be saved, the blob is removed so nothing is
 * left unreachable.
 */
export async function createFile(input: {
  leadId: string;
  kind: FileKind;
  name: string;
  contentType: string;
  body: Blob;
  actor: string;
}): Promise<JobFile | null> {
  if (!UUID.test(input.leadId)) return null;
  const sql = db();
  const [lead] = await sql`select id from leads where id = ${input.leadId}`;
  if (!lead) return null;

  const id = randomUUID();
  const pathname = `jobs/${input.leadId}/${id}-${safeName(input.name)}`;
  await put(pathname, input.body, { access: "private", contentType: input.contentType, addRandomSuffix: false });

  try {
    const rows = await sql`
      with created as (
        insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname)
        values (${id}, ${input.leadId}, ${input.actor}, ${input.kind}, ${input.name},
                ${input.contentType}, ${input.body.size}, ${pathname})
        returning *
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select lead_id, ${input.actor}, 'file', ${`Uploaded ${input.name}`} from created
      )
      select * from created`;
    return toFile(rows[0]);
  } catch (error) {
    await del(pathname).catch((cleanup) => console.error("Could not remove orphaned blob", cleanup));
    throw error;
  }
}

/** Removes the row and its event together, then the stored bytes. */
export async function deleteFile(fileId: string, actor: string): Promise<boolean> {
  if (!UUID.test(fileId)) return false;
  const rows = await db()`
    with removed as (
      delete from job_files where id = ${fileId} returning lead_id, name, blob_pathname
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'file', 'Deleted ' || name from removed
    )
    select blob_pathname from removed`;
  if (!rows[0]) return false;
  await del(rows[0].blob_pathname as string).catch((error) => console.error("Blob delete failed", error));
  return true;
}

export async function readFile(file: JobFile) {
  const result = await get(file.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType };
}

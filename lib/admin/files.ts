import "server-only";
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { db } from "@/lib/db";
import { docTypeLabel, type DocType } from "./doc-types";
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
  /** Set when an owner shares this file with the customer. */
  sharedAt?: Date | null;
  /** The label an owner put on a document; null until one is chosen. */
  docType?: DocType | null;
  /**
   * True when a contract_signatures row names this file, as the signed original or as the
   * stamped copy. Only listFiles computes it; the admin list uses it to hide controls that the
   * database would refuse anyway (setShared false, setDocType, deleteFile).
   */
  signed?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toFile(row: Record<string, unknown>): JobFile {
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
    sharedAt: row.shared_at ? new Date(row.shared_at as string) : null,
    docType: (row.doc_type as DocType | null) ?? null,
    signed: row.signed === true,
  };
}

export async function listFiles(leadId: string): Promise<JobFile[]> {
  if (!UUID.test(leadId)) return [];
  // One statement for the whole list, not a lookup per file.
  const rows = await db()`
    select job_files.*, exists (
      select 1 from contract_signatures s
      where s.file_id = job_files.id or s.signed_file_id = job_files.id
    ) as signed
    from job_files where lead_id = ${leadId} order by created_at desc`;
  return rows.map(toFile);
}

/**
 * The Blob pathname of every file on a job.
 *
 * Read this BEFORE the job row is deleted: `job_files` is `on delete cascade`, so once the
 * row is gone nothing is left to say which objects in storage belonged to it. The column is
 * named rather than starred — this feeds a destructive operation and nothing else.
 */
export async function listBlobPathnames(leadId: string): Promise<string[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`select blob_pathname from job_files where lead_id = ${leadId}`;
  return rows.map((row) => row.blob_pathname as string);
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

/**
 * Removes the row and its event together, then the stored bytes.
 *
 * A signed contract, and the stamped copy made from it, are frozen: the `not exists` clause
 * makes the database refuse them, and the blob is only deleted after a row was removed, so a
 * refusal leaves the bytes where they are. Returns false for a refusal, as for a missing file.
 */
export async function deleteFile(fileId: string, actor: string): Promise<boolean> {
  if (!UUID.test(fileId)) return false;
  const rows = await db()`
    with removed as (
      delete from job_files
      where id = ${fileId}
        and not exists (
          select 1 from contract_signatures s
          where s.file_id = job_files.id or s.signed_file_id = job_files.id
        )
      returning lead_id, name, blob_pathname
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

/**
 * Shares or stops sharing a photo or a document with the customer, and logs it
 * in the same statement. Files stay private until this is called with
 * `shared = true`; nothing else in this module sets shared_at.
 *
 * The `lead_id = ${jobId}` clause is what stops one job's file being shared
 * onto another job. Do not remove or loosen it.
 *
 * Two different things check that clause, and only one of them runs on its own:
 * tests/admin/file-sharing.test.ts:50 pins its presence in this statement, which
 * is a tripwire rather than a proof — it asserts a string. What the database
 * actually does is checked by scripts/verify-share-guard.ts, a manual script
 * that calls this function against a real Neon branch with a mismatched pair and
 * a positive control. Nothing runs that script for you. If you change this
 * guard, run it, and if you cannot, call the guard unverified.
 *
 * A signed contract and its stamped copy cannot be unshared: when `shared` is false the
 * `not exists` clause matches nothing for a file named by any contract_signatures row, and
 * this returns false. Sharing one again is allowed; it is a no-op on a file already shared.
 */
export async function setShared(jobId: string, fileId: string, shared: boolean, actor: string): Promise<boolean> {
  if (!UUID.test(jobId) || !UUID.test(fileId)) return false;
  const rows = await db()`
    with changed as (
      update job_files
      set shared_at = case when ${shared} then coalesce(shared_at, now()) else null end
      where id = ${fileId} and lead_id = ${jobId} and kind in ('photo','document')
        and (${shared} or not exists (
          select 1 from contract_signatures s
          where s.file_id = job_files.id or s.signed_file_id = job_files.id
        ))
      returning lead_id, name
    )
    insert into job_events (lead_id, actor, kind, body)
    select lead_id, ${actor}, 'file',
      ${shared ? "Shared " : "Stopped sharing "} || name || ${shared ? " with customer" : ""}
    from changed
    returning lead_id`;
  return rows.length > 0;
}

/**
 * Puts a type label on a document (or clears it) and logs the change. Labelling
 * is not sharing: this statement never reads or writes shared_at, so a document
 * stays private until setShared is called for it. `kind = 'document'` keeps a
 * photo from carrying a document label.
 *
 * A signed contract and its stamped copy cannot be relabelled: the `not exists` clause refuses
 * them, and this returns false.
 */
export async function setDocType(
  jobId: string, fileId: string, type: DocType | null, actor: string,
): Promise<boolean> {
  if (!UUID.test(jobId) || !UUID.test(fileId)) return false;
  const rows = await db()`
    with changed as (
      update job_files set doc_type = ${type}
      where id = ${fileId} and lead_id = ${jobId} and kind = 'document'
        and not exists (
          select 1 from contract_signatures s
          where s.file_id = job_files.id or s.signed_file_id = job_files.id
        )
      returning lead_id, name
    )
    insert into job_events (lead_id, actor, kind, body)
    select lead_id, ${actor}, 'file',
      ${type ? "Labelled " : "Removed the type label from "} || name || ${type ? ` as ${docTypeLabel(type)}` : ""}
    from changed
    returning lead_id`;
  return rows.length > 0;
}

/** The photos a customer may see for one job, newest first. Columns named, as for documents. */
export async function listSharedPhotos(leadId: string): Promise<JobFile[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`
    select id, lead_id, created_at, uploaded_by, kind, name, content_type, size_bytes,
           blob_pathname, shared_at, doc_type
    from job_files
    where lead_id = ${leadId} and kind = 'photo' and shared_at is not null
    order by created_at desc`;
  return rows.map(toFile);
}

/**
 * The documents a customer may see for one job, newest first. The columns are named rather
 * than starred: this feeds a customer-facing page, so a column added to job_files later
 * cannot reach the portal by accident.
 */
export async function listSharedDocuments(leadId: string): Promise<JobFile[]> {
  if (!UUID.test(leadId)) return [];
  const rows = await db()`
    select id, lead_id, created_at, uploaded_by, kind, name, content_type, size_bytes,
           blob_pathname, shared_at, doc_type
    from job_files
    where lead_id = ${leadId} and kind = 'document' and shared_at is not null
    order by created_at desc`;
  return rows.map(toFile);
}

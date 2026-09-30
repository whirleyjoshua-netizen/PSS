import "server-only";
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { db } from "@/lib/db";
import { docTypeLabel, isDocType, type DocType, type StoredDocType } from "./doc-types";
import { safeName, type FileKind } from "./uploads";
import type { SignMarks } from "@/lib/pdf/sign-marks";

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
  docType?: StoredDocType | null;
  /**
   * True when a contract_signatures row names this file, as the signed original or as the
   * stamped copy. Only listFiles computes it; undefined elsewhere, never a false "unsigned". The admin list uses it to hide controls that the
   * database would refuse anyway (setShared false, setDocType, deleteFile).
   */
  signed?: boolean;
  /**
   * True when a Direct Connect quote version names this file as its contract. Only listFiles
   * computes it, as for `signed`. Such a contract is managed from the Quote tab: the admin list
   * offers no type, share or delete control on it (setDocType, setShared and deleteFile refuse).
   */
  quoteContract?: boolean;
  /**
   * True when a Direct Connect quote version names this file as its quote PDF (Send quote shared it).
   * Only listFiles computes it. Such a quote is managed from the Quote tab: while its version is
   * offered, sent or signed, setShared(false), setDocType and deleteFile refuse it (the client is
   * approving it, or approved it); once superseded or cancelled, setShared(true) refuses it.
   */
  quoteFile?: boolean;
  /**
   * True when a job document (lib/docs/job-documents.ts) names this file as its PDF. Only
   * listFiles computes it. Such a file is managed from the Documents tab: sharing is Send's,
   * unsharing is Void's, and setShared, setDocType and deleteFile refuse it.
   */
  jobDocument?: boolean;
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
    docType: (row.doc_type as StoredDocType | null) ?? null,
    // Absent, not false, when the query never computed it: false would claim "not signed".
    signed: "signed" in row ? row.signed === true : undefined,
    quoteContract: "quote_contract" in row ? row.quote_contract === true : undefined,
    quoteFile: "quote_file" in row ? row.quote_file === true : undefined,
    jobDocument: "job_document" in row ? row.job_document === true : undefined,
  };
}

export async function listFiles(leadId: string): Promise<JobFile[]> {
  if (!UUID.test(leadId)) return [];
  // One statement for the whole list, not a lookup per file.
  const rows = await db()`
    select job_files.*, exists (
      select 1 from contract_signatures s
      where s.file_id = job_files.id or s.signed_file_id = job_files.id
    ) as signed, exists (
      select 1 from dc_quote_versions v where v.contract_file_id = job_files.id
    ) as quote_contract, exists (
      select 1 from dc_quote_versions q where q.quote_file_id = job_files.id
    ) as quote_file, exists (
      select 1 from job_documents d where d.file_id = job_files.id
    ) as job_document
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
  // A drawn signature's images live in Blob but have no job_files row: named here too, or deleting
  // the job would orphan them (contract_signatures cascades away with the job).
  const rows = await db()`
    select blob_pathname from job_files where lead_id = ${leadId}
    union all
    select p as blob_pathname
    from contract_signatures s
    cross join lateral unnest(array[s.signature_image_pathname, s.initials_image_pathname]) as p
    where s.lead_id = ${leadId} and p is not null`;
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
 *
 * `docType` is written in the same insert, so a file born as a Dealer Copy is never, even
 * for a moment, a document without that label. It defaults to null.
 *
 * `signMarks` (spec §3), where the client's initials and signature belong on a generated PDF, is
 * written in the same insert too, so a PDF that will be signed never exists without them.
 */
export async function createFile(input: {
  leadId: string;
  kind: FileKind;
  name: string;
  contentType: string;
  body: Blob;
  actor: string;
  docType?: StoredDocType;
  signMarks?: SignMarks | null;
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
        insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type, sign_marks)
        values (${id}, ${input.leadId}, ${input.actor}, ${input.kind}, ${input.name},
                ${input.contentType}, ${input.body.size}, ${pathname}, ${input.docType ?? null},
                ${input.signMarks ? JSON.stringify(input.signMarks) : null}::jsonb)
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
 *
 * A file a Direct Connect quote version names — its Dealer Copy (source_file_id) or its
 * contract (contract_file_id) — is refused the same way. Those foreign keys have no on-delete
 * action, so without the second `not exists` the delete would raise instead of returning false.
 *
 * The quote PDF of a version that is offered, sent or signed is refused too (ruling P17): the
 * client is approving it, or approved it. quote_file_id is on-delete set null, so this clause is
 * what keeps it; a superseded or cancelled version's quote may go.
 *
 * A file a job document names, and an acknowledged file, are refused the same way (spec §4
 * Freezing): job_documents.file_id has no on-delete action, so without the clause a delete would
 * raise instead of returning false.
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
        and not exists (
          select 1 from dc_quote_versions v
          where v.source_file_id = job_files.id or v.contract_file_id = job_files.id
        )
        and not exists (
          select 1 from dc_quote_versions q where q.quote_file_id = job_files.id and q.status in ('offered','sent','signed')
        )
        and not exists (
          select 1 from job_documents d where d.file_id = job_files.id
        )
        and not exists (
          select 1 from document_acknowledgements a where a.file_id = job_files.id
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
 *
 * A Dealer Copy (doc_type 'dealer_copy') shows dealer cost and is never matched, so sharing
 * one returns false. The database refuses it too (job_files_dealer_copy_never_shared); this
 * clause only turns that check violation into a plain refusal.
 *
 * A contract a superseded quote version names cannot be shared again: the client could sign it,
 * but signing a superseded version never moves the job. Unsharing it stays allowed.
 *
 * A quote PDF Send quote shared is managed from the Quote tab too (ruling P17): while its version
 * is offered, sent or signed it cannot be unshared (the client approves it on their project page),
 * and once its version is superseded or cancelled it cannot be shared again.
 *
 * A file a job document names is managed from the Documents tab (spec §4 Freezing): Send shares
 * it and Void unshares it, so this refuses it in both directions. An acknowledged file can be
 * shared again but never unshared, as for a signed contract.
 */
export async function setShared(jobId: string, fileId: string, shared: boolean, actor: string): Promise<boolean> {
  if (!UUID.test(jobId) || !UUID.test(fileId)) return false;
  const rows = await db()`
    with changed as (
      update job_files
      set shared_at = case when ${shared} then coalesce(shared_at, now()) else null end
      where id = ${fileId} and lead_id = ${jobId} and kind in ('photo','document')
        and doc_type is distinct from 'dealer_copy'
        and (${shared} or not exists (
          select 1 from contract_signatures s
          where s.file_id = job_files.id or s.signed_file_id = job_files.id
        ))
        and (not ${shared} or not exists (
          select 1 from dc_quote_versions v where v.contract_file_id = job_files.id and v.status = 'superseded'
        ))
        and (${shared} or not exists (
          select 1 from dc_quote_versions q where q.quote_file_id = job_files.id and q.status in ('offered','sent','signed')
        ))
        and (not ${shared} or not exists (
          select 1 from dc_quote_versions q where q.quote_file_id = job_files.id and q.status in ('superseded','cancelled')
        ))
        and not exists (
          select 1 from job_documents d where d.file_id = job_files.id
        )
        and (${shared} or not exists (
          select 1 from document_acknowledgements a where a.file_id = job_files.id
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
 *
 * A Dealer Copy can never be relabelled either, in both directions: the row that holds
 * 'dealer_copy' is never matched (relabelling it would free it to be shared), and
 * 'dealer_copy' is refused as a new label before any query, since the value arrives from a
 * form through a Server Action and its type is not enforced at runtime.
 *
 * A contract any quote version names keeps its label too: it is managed from the Quote tab. So
 * does the quote PDF of an offered, sent or signed version (ruling P17).
 *
 * A file a job document names, and an acknowledged file, keep their label as well (spec §4
 * Freezing): they are managed from the Documents tab.
 */
export async function setDocType(
  jobId: string, fileId: string, type: DocType | null, actor: string,
): Promise<boolean> {
  if (!UUID.test(jobId) || !UUID.test(fileId)) return false;
  if (type !== null && !isDocType(type)) return false;
  const rows = await db()`
    with changed as (
      update job_files set doc_type = ${type}
      where id = ${fileId} and lead_id = ${jobId} and kind = 'document'
        and doc_type is distinct from 'dealer_copy'
        and not exists (
          select 1 from contract_signatures s
          where s.file_id = job_files.id or s.signed_file_id = job_files.id
        )
        and not exists (
          select 1 from dc_quote_versions v where v.contract_file_id = job_files.id
        )
        and not exists (
          select 1 from dc_quote_versions q where q.quote_file_id = job_files.id and q.status in ('offered','sent','signed')
        )
        and not exists (
          select 1 from job_documents d where d.file_id = job_files.id
        )
        and not exists (
          select 1 from document_acknowledgements a where a.file_id = job_files.id
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

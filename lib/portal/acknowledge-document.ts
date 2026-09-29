import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile, toFile, type JobFile } from "@/lib/admin/files";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";

/** `id` is the job document; `file` is its shared PDF, the thing acknowledged. */
export type AcknowledgeableDocument = { id: string; title: string; file: JobFile };

export type Acknowledgement = {
  id: string; leadId: string; fileId: string; acknowledgedName: string; acknowledgedEmail: string;
  acknowledgedAt: Date; docSha256: string;
};

/** "already-acknowledged" is internal: nothing was written, so the caller must not email again. */
export type AckRecordResult = "acknowledged" | "already-acknowledged" | "not-found" | "invalid";

const toAcknowledgement = (row: Record<string, unknown>): Acknowledgement => ({
  id: row.id as string,
  leadId: row.lead_id as string,
  fileId: row.file_id as string,
  acknowledgedName: row.acknowledged_name as string,
  acknowledgedEmail: row.acknowledged_email as string,
  acknowledgedAt: new Date(row.acknowledged_at as string),
  docSha256: row.doc_sha256 as string,
});

/**
 * The documents this job can still be asked to acknowledge. ONE helper, used by both the page and
 * the action, exactly as signableContracts is, so the control the page shows and the post the
 * action accepts cannot drift apart. File columns are named, never starred: this feeds the portal.
 */
export async function acknowledgeableDocuments(leadId: string): Promise<AcknowledgeableDocument[]> {
  if (!isUuid(leadId)) return [];
  const rows = await db()`
    select d.id as document_id, d.title,
           f.id, f.lead_id, f.created_at, f.uploaded_by, f.kind, f.name, f.content_type, f.size_bytes,
           f.blob_pathname, f.shared_at, f.doc_type
    from job_documents d join job_files f on f.id = d.file_id
    where d.lead_id = ${leadId} and f.lead_id = ${leadId}
      and d.response = 'acknowledge' and d.status = 'sent' and f.shared_at is not null
      and not exists (select 1 from document_acknowledgements a where a.file_id = f.id)
    order by d.sent_at`;
  return rows.map((row) => ({
    id: row.document_id as string,
    title: row.title as string,
    file: toFile(row as Record<string, unknown>),
  }));
}

export async function acknowledgementFor(fileId: string): Promise<Acknowledgement | null> {
  if (!isUuid(fileId)) return null;
  const rows = await db()`select * from document_acknowledgements where file_id = ${fileId}`;
  return rows[0] ? toAcknowledgement(rows[0] as Record<string, unknown>) : null;
}

/**
 * Records one acknowledgement (spec §7). Does NOT check ownership: every caller first re-derives
 * the customer's jobs from the session and the document from acknowledgeableDocuments.
 *
 * The fingerprint is of the bytes actually served. One statement, and the document's move from
 * 'sent' to 'completed' comes FIRST: the record and the event are inserted only from the row that
 * update returned. Postgres re-checks an update's where clause against a row a concurrent
 * transaction just changed, so a void (or a second submission) that commits first leaves the
 * update matching nothing, and nothing at all is written. `on conflict (file_id) do nothing` still
 * guards the record itself. The timeline names the document, never the typed name.
 */
export async function recordAcknowledgement(input: {
  jobId: string; document: AcknowledgeableDocument; name: string; email: string; ip: string | null; userAgent: string | null;
}): Promise<AckRecordResult> {
  const name = input.name.trim();
  if (!name) return "invalid";
  const stored = await readFile(input.document.file);
  if (!stored) return "not-found";
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileId = input.document.file.id;

  const rows = await db()`
    with completed as (
      update job_documents d set status = 'completed', completed_at = now(), updated_at = now()
      from job_files f
      where d.id = ${input.document.id} and d.lead_id = ${input.jobId} and d.file_id = ${fileId}
        and f.id = d.file_id and f.lead_id = ${input.jobId}
        and d.response = 'acknowledge' and d.status = 'sent' and f.shared_at is not null
      returning d.lead_id, d.file_id
    ),
    acked as (
      insert into document_acknowledgements (id, lead_id, file_id, acknowledged_name, acknowledged_email, ip, user_agent, doc_sha256)
      select ${randomUUID()}, lead_id, file_id, ${name}, ${input.email}, ${input.ip}, ${input.userAgent}, ${sha256}
      from completed
      on conflict (file_id) do nothing
      returning lead_id, file_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.email}, 'document', ${`Acknowledged "${input.document.title}" from their project page`} from acked
    )
    select file_id from acked`;
  if (rows.length > 0) return "acknowledged";
  const existing = await acknowledgementFor(fileId);
  return existing && existing.leadId === input.jobId ? "already-acknowledged" : "not-found";
}

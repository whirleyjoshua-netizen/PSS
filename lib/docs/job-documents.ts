import "server-only";
import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { MARKER_SOURCE } from "./fields";
import type { ClientDocKind, DocResponse, DocStatus } from "./kinds";

export type JobDocument = {
  id: string; leadId: string; templateId: string | null; title: string; kind: ClientDocKind; response: DocResponse;
  body: string; status: DocStatus; fileId: string | null; sentAt: Date | null; sentBy: string | null;
  completedAt: Date | null; voidedAt: Date | null; createdBy: string; createdAt: Date; updatedAt: Date;
};

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null);

const toDocument = (row: Record<string, unknown>): JobDocument => ({
  id: row.id as string,
  leadId: row.lead_id as string,
  templateId: (row.template_id as string | null) ?? null,
  title: row.title as string,
  kind: row.kind as ClientDocKind,
  response: row.response as DocResponse,
  body: row.body as string,
  status: row.status as DocStatus,
  fileId: (row.file_id as string | null) ?? null,
  sentAt: date(row.sent_at),
  sentBy: (row.sent_by as string | null) ?? null,
  completedAt: date(row.completed_at),
  voidedAt: date(row.voided_at),
  createdBy: row.created_by as string,
  createdAt: new Date(row.created_at as string),
  updatedAt: new Date(row.updated_at as string),
});

export async function listJobDocuments(leadId: string): Promise<JobDocument[]> {
  if (!isUuid(leadId)) return [];
  const rows = await db()`select * from job_documents where lead_id = ${leadId} order by created_at desc`;
  return rows.map((row) => toDocument(row as Record<string, unknown>));
}

export async function getJobDocument(leadId: string, documentId: string): Promise<JobDocument | null> {
  if (!isUuid(leadId) || !isUuid(documentId)) return null;
  const rows = await db()`select * from job_documents where id = ${documentId} and lead_id = ${leadId}`;
  return rows[0] ? toDocument(rows[0] as Record<string, unknown>) : null;
}

/**
 * The draft and its timeline row together. Nothing is written for a job that does not exist, or
 * for a template id that does not exist (an archived template still counts: the text is a copy).
 */
export async function insertDraft(input: {
  leadId: string; templateId: string | null; title: string; kind: ClientDocKind; response: DocResponse; body: string; actor: string;
}): Promise<string | null> {
  if (!isUuid(input.leadId) || (input.templateId !== null && !isUuid(input.templateId))) return null;
  const rows = await db()`
    with created as (
      insert into job_documents (id, lead_id, template_id, title, kind, response, body, status, created_by)
      select ${randomUUID()}, id, ${input.templateId}, ${input.title}, ${input.kind}, ${input.response}, ${input.body}, 'draft', ${input.actor}
      from leads where id = ${input.leadId}
        and (${input.templateId}::uuid is null or exists (select 1 from document_templates where id = ${input.templateId}::uuid))
      returning id, lead_id, title
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'document', 'Drafted "' || title || '"' from created
    )
    select id from created`;
  return (rows[0]?.id as string | undefined) ?? null;
}

/** Spec §4: a sent or completed document can't be edited. Saves are not logged: they are drafts. */
export async function updateDraft(input: { leadId: string; documentId: string; title: string; body: string }): Promise<boolean> {
  if (!isUuid(input.leadId) || !isUuid(input.documentId)) return false;
  const rows = await db()`
    update job_documents set title = ${input.title}, body = ${input.body}, updated_at = now()
    where id = ${input.documentId} and lead_id = ${input.leadId} and status = 'draft'
    returning id`;
  return rows.length > 0;
}

export async function discardDraft(leadId: string, documentId: string, actor: string): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(documentId)) return false;
  const rows = await db()`
    with removed as (
      delete from job_documents where id = ${documentId} and lead_id = ${leadId} and status = 'draft'
      returning lead_id, title
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'document', 'Discarded draft "' || title || '"' from removed
    )
    select lead_id from removed`;
  return rows.length > 0;
}

/**
 * Spec §6 step 3, one statement: the draft becomes sent (completed for a view document, which has
 * nothing to wait for), names its PDF, the PDF is shared, and the event is logged.
 *
 * Every blocker is re-checked where it is stored: still a draft; the title and body are exactly
 * the ones the PDF was rendered from (an edit saved in another tab after the render refuses the
 * send rather than leaving a PDF that differs from the record); no `{{…}}` marker, using the
 * same pattern the app uses; the job is not Lost and has an email; the file is this job's.
 */
export async function markSent(input: {
  leadId: string; documentId: string; fileId: string; title: string; body: string; actor: string;
}): Promise<boolean> {
  if (!isUuid(input.leadId) || !isUuid(input.documentId) || !isUuid(input.fileId)) return false;
  const rows = await db()`
    with sent as (
      update job_documents
      set status = case when response = 'view' then 'completed' else 'sent' end,
        file_id = ${input.fileId}, sent_at = now(), sent_by = ${input.actor},
        completed_at = case when response = 'view' then now() else null end,
        updated_at = now()
      where id = ${input.documentId} and lead_id = ${input.leadId} and status = 'draft'
        and title = ${input.title} and body = ${input.body}
        and body !~ ${MARKER_SOURCE}
        and exists (select 1 from leads where id = ${input.leadId} and status <> 'lost' and nullif(trim(email), '') is not null)
        and exists (select 1 from job_files where id = ${input.fileId} and lead_id = ${input.leadId})
      returning lead_id, title
    ),
    shared as (
      update job_files set shared_at = now() where id = ${input.fileId} and lead_id = ${input.leadId} and exists (select 1 from sent)
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'document', 'Sent "' || title || '"' from sent
    )
    select lead_id from sent`;
  return rows.length > 0;
}

/**
 * Spec §6: withdraws a sent document before it is answered. Refused unless the row is still
 * `sent`, and refused when a signature or acknowledgement row naming its file is already
 * committed when this statement starts.
 *
 * Those `not exists` checks do not see an answer committed after this statement begins. The race
 * is settled on the job_documents row itself: the sign and acknowledge statements also update it
 * (sent -> completed), so whichever statement locks the row first wins, and the other re-checks
 * `status` after the lock and skips. The one edge the plan accepts: void wins, and the client's
 * signature or acknowledgement row is still written for a document that is now void.
 */
export async function voidDocument(leadId: string, documentId: string, actor: string): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(documentId)) return false;
  const rows = await db()`
    with voided as (
      update job_documents set status = 'void', voided_at = now(), updated_at = now()
      where id = ${documentId} and lead_id = ${leadId} and status = 'sent'
        and not exists (select 1 from document_acknowledgements a where a.file_id = job_documents.file_id)
        and not exists (select 1 from contract_signatures s where s.file_id = job_documents.file_id)
      returning lead_id, file_id, title
    ),
    unshared as (
      update job_files set shared_at = null where id = (select file_id from voided) and lead_id = ${leadId}
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'document', 'Voided "' || title || '"' from voided
    )
    select file_id from voided`;
  return rows.length > 0;
}

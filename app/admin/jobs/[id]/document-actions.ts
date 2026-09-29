"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { discardDraft, updateDraft, voidDocument } from "@/lib/docs/job-documents";
import { BODY_MAX } from "@/lib/docs/validate";
import { TITLE_MAX, createDocumentFromTemplate, sendJobDocument } from "@/lib/docs/workflow";

const str = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");
const refresh = (jobId: string) => revalidatePath(`/admin/jobs/${jobId}`);

// Each action calls requireAdmin() before reading its input.
export async function createDocumentAction(_previous: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const jobId = str(formData.get("jobId"));
  const templateId = str(formData.get("templateId"));
  if (!isUuid(jobId) || !isUuid(templateId)) return { error: "Choose a template." };
  const result = await createDocumentFromTemplate({ jobId, templateId, actor: admin.email });
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  redirect(`/admin/jobs/${jobId}?tab=documents&doc=${result.id}`);
}

export type DocumentFormState = { error?: string; saved?: boolean };

/** Drafts only (updateDraft's WHERE). The title is stored as typed, so the screen and the record match. */
export async function saveDocumentAction(_previous: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  await requireAdmin();
  const jobId = str(formData.get("jobId"));
  const documentId = str(formData.get("documentId"));
  const title = str(formData.get("title"));
  const body = str(formData.get("body"));
  if (!title.trim()) return { error: "Give the document a title." };
  if (title.length > TITLE_MAX) return { error: `The title must be ${TITLE_MAX} characters or fewer.` };
  if (body.length > BODY_MAX) return { error: "The document is too long." };
  if (!(await updateDraft({ leadId: jobId, documentId, title, body }))) {
    return { error: "This document has been sent and can no longer be changed." };
  }
  refresh(jobId);
  return { saved: true };
}

/**
 * `emailed: false` means the document WAS sent (stored, shared, logged) but the client's email
 * failed; the caller must say so rather than report a plain success.
 */
export async function sendDocumentAction(jobId: string, documentId: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }> {
  const admin = await requireAdmin();
  let result: Awaited<ReturnType<typeof sendJobDocument>>;
  try {
    result = await sendJobDocument({ jobId, documentId, actor: admin.email });
  } catch (error) {
    // Blob or pdf-lib can throw. The owner gets a plain answer, not the error page.
    console.error("Sending the document failed", error);
    return { error: "The document could not be sent. Try again, and if it keeps failing, contact support." };
  }
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { ok: true, emailed: result.emailed };
}

export async function voidDocumentAction(jobId: string, documentId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!(await voidDocument(jobId, documentId, admin.email))) {
    return { error: "Only a sent document that hasn't been signed or acknowledged can be voided." };
  }
  refresh(jobId);
  return {};
}

export async function discardDocumentAction(jobId: string, documentId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!(await discardDraft(jobId, documentId, admin.email))) return { error: "Only a draft can be discarded." };
  refresh(jobId);
  return {};
}

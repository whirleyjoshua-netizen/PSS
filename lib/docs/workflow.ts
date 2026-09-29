import "server-only";
import { createFile, deleteFile } from "@/lib/admin/files";
import { getJob, type Job } from "@/lib/admin/jobs";
import { formatProjectNo } from "@/lib/portal/project-no";
import { sendDocumentEmail } from "./emails";
import { fieldValues, fillFields } from "./fill";
import { getJobDocument, insertDraft, markSent, type JobDocument } from "./job-documents";
import { isClientDocKind } from "./kinds";
import { parseDocText, remainingMarkers } from "./parse";
import { buildDocumentPdf } from "./pdf";
import { getTemplate } from "./templates";

export const SEND_RACE = "This document changed while you were sending. Reload and try again.";
export const TITLE_MAX = 200;

/** Spec §6: every reason Send is disabled, each said plainly. The page and sendJobDocument share it. */
export function documentSendBlockers(doc: Pick<JobDocument, "status" | "title" | "body">, job: Pick<Job, "email" | "status">): string[] {
  const blockers: string[] = [];
  if (doc.status !== "draft") blockers.push("This document has already been sent.");
  if (!doc.title.trim()) blockers.push("Give the document a title.");
  if (!doc.body.trim()) blockers.push("The document is empty.");
  const markers = remainingMarkers(doc.body);
  if (markers.length > 0) blockers.push(`Fill in ${markers.join(", ")} first.`);
  if (!job.email?.trim()) blockers.push("Add the client's email to the job first.");
  if (job.status === "lost") blockers.push("This job is marked Lost.");
  return blockers;
}

/** Spec §6: copies a live client-document template into a draft, fields filled from the job now. */
export async function createDocumentFromTemplate(input: {
  jobId: string; templateId: string; actor: string; now?: Date;
}): Promise<{ id: string } | { error: string }> {
  const [job, template] = await Promise.all([getJob(input.jobId), getTemplate(input.templateId)]);
  if (!job) return { error: "This job no longer exists." };
  if (!template || template.archivedAt || !isClientDocKind(template.kind)) {
    return { error: "That template is no longer available. Reload the page." };
  }
  const filled = fillFields(template.body, fieldValues(job, input.now ?? new Date()));
  if (filled.unknown.length > 0) {
    return { error: `The template uses fields that don't exist (${filled.unknown.map((key) => `{{${key}}}`).join(", ")}). Fix it on the Documents page.` };
  }
  const projectNo = formatProjectNo(job.projectNo);
  const title = (projectNo ? `${template.name} — ${projectNo}` : template.name).slice(0, TITLE_MAX);
  // The store throws on a blank title (a CHECK), so refuse it here in words instead.
  if (!title.trim()) return { error: "Give the template a name on the Documents page." };
  // Null: the job, or the template, was removed between the reads above and the insert.
  const id = await insertDraft({
    leadId: job.id, templateId: template.id, title, kind: template.kind, response: template.response, body: filled.text, actor: input.actor,
  });
  return id ? { id } : { error: "This job or template no longer exists. Reload the page." };
}

/**
 * Spec §6 Send: render the stored text, store the PDF, then one statement sends, links, shares and
 * logs. markSent re-checks every blocker and that the stored title and body are the ones rendered,
 * so a draft saved in another tab meanwhile refuses the send. Nothing links to the PDF until that
 * statement succeeds, so any refusal or error removes it. The email goes last: a failed email
 * leaves the document sent and answers emailed false.
 */
export async function sendJobDocument(input: {
  jobId: string; documentId: string; actor: string; now?: Date;
}): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const [job, doc] = await Promise.all([getJob(input.jobId), getJobDocument(input.jobId, input.documentId)]);
  if (!job) return { error: "This job no longer exists." };
  if (!doc) return { error: "This document no longer exists." };
  const blockers = documentSendBlockers(doc, job);
  if (blockers.length > 0) return { error: blockers[0] };

  const pdf = await buildDocumentPdf({
    title: doc.title, projectNo: formatProjectNo(job.projectNo), date: input.now ?? new Date(),
    client: { name: job.name, address: job.address, city: job.city, email: job.email },
    blocks: parseDocText(doc.body), response: doc.response,
  });
  const file = await createFile({
    leadId: job.id, kind: "document", name: `${doc.title}.pdf`, contentType: "application/pdf",
    body: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), actor: input.actor,
    docType: doc.response === "sign" ? "contract" : "other",
  });
  if (!file) return { error: "This job no longer exists." };

  let sent: boolean;
  try {
    sent = await markSent({ leadId: job.id, documentId: doc.id, fileId: file.id, title: doc.title, body: doc.body, actor: input.actor });
  } catch (error) {
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unsent document", cleanup));
    throw error;
  }
  if (!sent) {
    if (!(await deleteFile(file.id, input.actor))) console.error(`Could not remove the unsent document ${file.id}`);
    return { error: SEND_RACE };
  }
  try {
    await sendDocumentEmail(job, doc.title, doc.response);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Document "${doc.title}" sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}

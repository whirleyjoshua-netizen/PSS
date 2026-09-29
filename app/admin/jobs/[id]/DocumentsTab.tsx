import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { formatShortDate } from "@/lib/admin/time";
import { docResponseLabel, isClientDocKind, templateKindLabel } from "@/lib/docs/kinds";
import { listJobDocuments, type JobDocument } from "@/lib/docs/job-documents";
import { listTemplates } from "@/lib/docs/templates";
import { documentSendBlockers } from "@/lib/docs/workflow";
import { CreateDocumentForm } from "./CreateDocumentForm";
import { DocumentPanel } from "./DocumentPanel";
import { firstParam } from "./tabs";
import { HEADING, TEXT_LINK } from "./ui";
import { VoidDocumentButton } from "./VoidDocumentButton";

/** Matched, never rendered: a crafted `?sent=` can never put words of its own on the page. */
export const SENT_NOTICES = {
  "1": "Sent.",
  "email-failed": "Sent, but the email to the client failed — send them their project page link yourself.",
} as const;
export type SentNotice = keyof typeof SENT_NOTICES;

export function parseSentNotice(value: string | string[] | undefined): SentNotice | null {
  const v = firstParam(value);
  return v === "1" || v === "email-failed" ? v : null;
}

export function documentStatusLabel(doc: Pick<JobDocument, "status" | "response" | "sentAt" | "completedAt">): string {
  if (doc.status === "draft") return "Draft";
  if (doc.status === "void") return "Void";
  if (doc.status === "completed" && doc.response === "sign" && doc.completedAt) return `Signed ${formatShortDate(doc.completedAt)}`;
  if (doc.status === "completed" && doc.response === "acknowledge" && doc.completedAt) return `Acknowledged ${formatShortDate(doc.completedAt)}`;
  const at = doc.sentAt ?? doc.completedAt;
  return at ? `Sent ${formatShortDate(at)}` : "Sent";
}

/** As voidDocument allows: a sent document not yet answered, or a view document shared by mistake. */
function canVoid(doc: Pick<JobDocument, "status" | "response">): boolean {
  return doc.status === "sent" || (doc.status === "completed" && doc.response === "view");
}

/** Spec §6: create from a template, edit the draft, send; the list shows each document's state. */
export async function DocumentsTab({ job, selectedId, sentNotice }: {
  job: Pick<Job, "id" | "email" | "status">;
  selectedId: string | null;
  sentNotice: SentNotice | null;
}) {
  const [documents, templates] = await Promise.all([listJobDocuments(job.id), listTemplates()]);
  const usable = templates.filter((template) => isClientDocKind(template.kind));
  const selected = documents.find((doc) => doc.id === selectedId && doc.status === "draft") ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h2 className={HEADING}>Documents</h2>
      {sentNotice ? <p role="status" className="text-sm">{SENT_NOTICES[sentNotice]}</p> : null}
      {usable.length > 0 ? (
        <CreateDocumentForm jobId={job.id} templates={usable.map((t) => ({ id: t.id, name: t.name, kindLabel: templateKindLabel(t.kind) }))} />
      ) : (
        <p className="text-sm">
          No client document templates yet. <Link href="/admin/documents/new" className={TEXT_LINK}>Write one on the Documents page</Link>.
        </p>
      )}
      {documents.length === 0 ? <p className="text-sm text-ink-soft">No documents on this job yet.</p> : (
        <ul aria-label="Documents on this job" className="flex flex-col divide-y divide-rule border border-rule">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1 basis-full font-semibold sm:basis-auto">{doc.title}</span>
              <span className="text-ink-soft">{docResponseLabel(doc.response)}</span>
              <span>{documentStatusLabel(doc)}</span>
              {/* A signed document opens its stamped copy; until one exists, the PDF that was sent. */}
              {doc.fileId ? <a href={`/admin/files/${doc.signedFileId ?? doc.fileId}`} target="_blank" rel="noreferrer" className={TEXT_LINK}>PDF</a> : null}
              {doc.status === "draft" ? <Link href={`/admin/jobs/${job.id}?tab=documents&doc=${doc.id}`} className={TEXT_LINK}>Edit</Link> : null}
              {canVoid(doc) ? <VoidDocumentButton jobId={job.id} documentId={doc.id} title={doc.title} /> : null}
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <DocumentPanel key={selected.id} jobId={job.id}
          doc={{ id: selected.id, title: selected.title, body: selected.body, response: selected.response }}
          blockers={documentSendBlockers(selected, job)} />
      ) : null}
    </div>
  );
}

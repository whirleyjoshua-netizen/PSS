"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DocEditor } from "@/app/admin/documents/DocEditor";
import type { DocResponse } from "@/lib/docs/kinds";
import { discardDocumentAction, saveDocumentAction, sendDocumentAction, type DocumentFormState } from "./document-actions";
import { CARD } from "./ui";

/**
 * One draft. Send works from the SAVED text only: blockers are computed on the server from what is
 * stored, and Send is disabled while the screen differs from it, so what is sent is what is shown.
 */
export function DocumentPanel({ jobId, doc, blockers }: {
  jobId: string;
  doc: { id: string; title: string; body: string; response: DocResponse };
  blockers: string[];
}) {
  const router = useRouter();
  const [state, save, saving] = useActionState<DocumentFormState, FormData>(saveDocumentAction, {});
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const dirty = title !== doc.title || body !== doc.body;

  const send = () => startBusy(async () => {
    setError(null);
    const result = await sendDocumentAction(jobId, doc.id);
    if (result.error) return setError(result.error);
    // Sent either way; a failed email gets its own notice so the owner knows to tell the client.
    router.replace(`/admin/jobs/${jobId}?tab=documents&sent=${result.emailed === false ? "email-failed" : "1"}`);
  });
  const discard = () => startBusy(async () => {
    setError(null);
    const result = await discardDocumentAction(jobId, doc.id);
    if (result.error) return setError(result.error);
    router.replace(`/admin/jobs/${jobId}?tab=documents`);
  });

  return (
    <section aria-labelledby="draft-heading" className={CARD}>
      <h3 id="draft-heading" className="text-base font-semibold">Draft: {doc.title}</h3>
      <form action={save} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="documentId" value={doc.id} />
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200}
            className="min-h-11 border border-rule bg-ivory px-3" />
        </label>
        <DocEditor name="body" label="Text" defaultValue={doc.body} mode="document" titleField="title"
          previewExtras={{ jobId, response: doc.response }} onChange={setBody} />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="min-h-11 border border-charcoal px-4 text-sm">Save draft</button>
          {state.saved && !dirty ? <p role="status" className="text-sm">Saved.</p> : null}
          {state.error ? <p role="alert" className="text-sm text-overdue">{state.error}</p> : null}
        </div>
      </form>
      {blockers.length > 0 ? (
        <ul aria-label="Before you can send" className="flex list-disc flex-col gap-1 pl-5 text-sm text-overdue">
          {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      ) : null}
      {dirty ? <p className="text-sm text-ink-soft">Save your changes before sending.</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={send} disabled={busy || dirty || blockers.length > 0} className="min-h-11 bg-charcoal px-5 text-sm text-ivory disabled:opacity-50">
          Send to client
        </button>
        <button type="button" onClick={discard} disabled={busy} className="min-h-11 border border-rule px-4 text-sm">Discard draft</button>
      </div>
      {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}
    </section>
  );
}

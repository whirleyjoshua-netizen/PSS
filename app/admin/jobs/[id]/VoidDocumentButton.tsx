"use client";

import { useState, useTransition } from "react";
import { voidDocumentAction } from "./document-actions";

/** Withdraws a sent, unanswered document: its file is un-shared and it reads Void (spec §6). */
export function VoidDocumentButton({ jobId, documentId, title }: { jobId: string; documentId: string; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      <button type="button" aria-label={`Void ${title}`} disabled={pending} className="min-h-11 border border-charcoal px-3 text-sm"
        onClick={() => start(async () => setError((await voidDocumentAction(jobId, documentId)).error ?? null))}>
        Void
      </button>
      {error ? <span role="alert" className="text-xs text-overdue">{error}</span> : null}
    </span>
  );
}

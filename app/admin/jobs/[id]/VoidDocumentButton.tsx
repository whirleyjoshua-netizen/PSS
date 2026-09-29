"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidDocumentAction } from "./document-actions";

/** Withdraws a sent, unanswered document or a view document: its file is un-shared and it reads Void (spec §6). */
export function VoidDocumentButton({ jobId, documentId, title }: { jobId: string; documentId: string; title: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const voidIt = () => start(async () => {
    const result = await voidDocumentAction(jobId, documentId);
    setError(result.error ?? null);
    // Refused: the client likely answered meanwhile. Reload the list so the row shows what is stored.
    if (result.error) router.refresh();
  });
  return (
    <span className="flex flex-col gap-1">
      <button type="button" aria-label={`Void ${title}`} disabled={pending} className="min-h-11 border border-charcoal px-3 text-sm" onClick={voidIt}>
        Void
      </button>
      {error ? <span role="alert" className="text-xs text-overdue">{error}</span> : null}
    </span>
  );
}

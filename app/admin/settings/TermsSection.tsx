"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatWhen } from "@/lib/admin/time";

/** The terms route refuses the same thing, with the same words. */
const NOT_A_PDF = "Upload a PDF file (its type must be application/pdf).";
const FAILED = "Upload failed. Check your signal and try again.";

async function postTerms(file: File): Promise<{ ok: true } | { error: string }> {
  const data = new FormData();
  data.append("file", file, file.name);
  try {
    const response = await fetch("/admin/settings/terms", { method: "POST", body: data });
    if (response.status === 413) return { error: "That file is too large to upload." };
    const body = await response.json().catch(() => null);
    if (response.ok && body?.ok) return { ok: true };
    return { error: body?.error ?? FAILED };
  } catch {
    return { error: FAILED };
  }
}

/** The contract terms PDF appended to every contract sent from now on. */
export function TermsSection({ updatedAt }: { updatedAt: Date | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = updatedAt ? "Replace terms PDF" : "Upload terms PDF";

  return (
    <section aria-labelledby="terms-heading" className="flex flex-col gap-2">
      <h2 id="terms-heading" className="text-lg font-semibold">
        Contract terms
      </h2>
      {updatedAt ? (
        <p className="text-ink-soft">Terms last updated {formatWhen(updatedAt)}.</p>
      ) : (
        <p className="text-overdue">No terms uploaded. Contracts can&apos;t be sent until you add them.</p>
      )}
      <p className="text-sm text-ink-soft">Contracts already sent keep the terms they were sent with.</p>
      <label className="inline-flex min-h-11 cursor-pointer items-center self-start border border-charcoal px-4 text-sm">
        {pending ? "Uploading…" : label}
        <input
          type="file"
          accept="application/pdf"
          aria-label={label}
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.type !== "application/pdf") return setError(NOT_A_PDF);
            setError(null);
            startTransition(async () => {
              const result = await postTerms(file);
              if ("error" in result) setError(result.error);
              else router.refresh();
            });
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : null}
    </section>
  );
}

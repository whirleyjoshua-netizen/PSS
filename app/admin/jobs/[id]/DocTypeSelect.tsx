"use client";

import { useState, useTransition } from "react";
import { setFileDocType } from "@/app/admin/jobs/measure-actions";
import { DOC_TYPES, isDocType, type DocType } from "@/lib/admin/doc-types";

/**
 * The type label on one document. Saves as soon as the choice changes, and puts
 * the old choice back if the save fails — the same shape ReviewSection uses for
 * its save-on-change control.
 *
 * Labelling is not sharing: this control only ever calls setFileDocType, so a
 * document stays private until its own share switch is used.
 */
export function DocTypeSelect({ jobId, fileId, fileName, docType }: {
  jobId: string;
  fileId: string;
  fileName: string;
  docType: DocType | null;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<DocType | "">(docType ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Document type for ${fileName}`}
        value={value}
        disabled={pending}
        onChange={(event) => {
          const raw = event.target.value;
          const next = isDocType(raw) ? raw : "";
          const previous = value;
          setValue(next);
          startTransition(async () => {
            try {
              await setFileDocType(jobId, fileId, next === "" ? null : next);
              setError(null);
            } catch {
              setValue(previous);
              setError("Couldn't save that type. Try again.");
            }
          });
        }}
        className="min-h-11 border border-rule bg-ivory px-2 text-sm"
      >
        <option value="">No type</option>
        {DOC_TYPES.map((type) => (
          <option key={type.value} value={type.value}>{type.label}</option>
        ))}
      </select>
      {error ? <p role="alert" className="text-xs text-overdue">{error}</p> : null}
    </div>
  );
}

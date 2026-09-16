"use client";

import { useTransition } from "react";
import { setFileDocType } from "@/app/admin/jobs/measure-actions";
import { DOC_TYPES, isDocType, type DocType } from "@/lib/admin/doc-types";

/**
 * The type label on one document. Saves as soon as the choice changes.
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
  return (
    <select
      aria-label={`Document type for ${fileName}`}
      defaultValue={docType ?? ""}
      disabled={pending}
      onChange={(event) => {
        const value = event.currentTarget.value;
        startTransition(() => setFileDocType(jobId, fileId, isDocType(value) ? value : null));
      }}
      className="min-h-11 border border-rule bg-ivory px-2 text-sm"
    >
      <option value="">No type</option>
      {DOC_TYPES.map((type) => (
        <option key={type.value} value={type.value}>{type.label}</option>
      ))}
    </select>
  );
}

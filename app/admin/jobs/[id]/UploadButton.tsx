"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postFile } from "@/lib/admin/client-upload";
import { checkUpload } from "@/lib/admin/uploads";

export function UploadButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center self-start border border-charcoal px-4 text-sm">
        {pending ? "Uploading…" : "Upload file"}
        <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const problem = checkUpload("document", file.type, file.size);
            if (problem) return setError(problem);
            setError(null);
            startTransition(async () => {
              const result = await postFile(jobId, file, file.name, "document");
              if ("error" in result) setError(result.error);
              else router.refresh();
            });
          }} />
      </label>
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
    </div>
  );
}

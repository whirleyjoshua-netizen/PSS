"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postFile, resizePhoto } from "@/lib/admin/client-upload";
import { checkUpload } from "@/lib/admin/uploads";

/** Install and before/after photos. Resized on the phone like measuring photos. */
export function AddPhotoButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-11 cursor-pointer items-center self-start border border-charcoal px-4 text-sm">
        {pending ? "Uploading…" : "Add photo"}
        <input type="file" accept="image/*" className="sr-only" disabled={pending} aria-label="Add photo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setError(null);
            startTransition(async () => {
              try {
                const photo = await resizePhoto(file);
                const problem = checkUpload("photo", "image/jpeg", photo.size);
                if (problem) return setError(problem);
                const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
                const result = await postFile(jobId, photo, name, "photo");
                if ("error" in result) setError(result.error);
                else router.refresh();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Upload failed. Try again.");
              }
            });
          }} />
      </label>
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
    </div>
  );
}

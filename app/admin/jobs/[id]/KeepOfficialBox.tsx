"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setKeptOfficialAction } from "@/app/admin/jobs/measure-actions";

/**
 * "Keep as official measure": the designer's numbers become the job's official measure, so no
 * second trip is booked. Refused (and disabled) once an official measure has been recorded.
 */
export function KeepOfficialBox({ jobId, kept, blocked }: { jobId: string; kept: boolean; blocked: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(kept);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await setKeptOfficialAction(jobId, next);
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={shown} disabled={pending || (blocked && !kept)}
          onChange={(e) => change(e.target.checked)} className="size-5" />
        Keep as official measure
      </label>
      {blocked && !kept ? <p className="text-sm text-ink-soft">An official measure is already recorded.</p> : null}
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
    </div>
  );
}

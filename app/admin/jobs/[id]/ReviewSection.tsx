"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { isInstalled } from "@/lib/admin/stages";
import { formatWhen } from "@/lib/admin/time";
import { saveReviewOptOut, sendReviewNow, type FormState } from "../actions";

export function ReviewSection({ job }: { job: Job }) {
  const [state, action, sending] = useActionState<FormState, FormData>(sendReviewNow.bind(null, job.id), {});
  const [isPending, startTransition] = useTransition();
  const [optOut, setOptOut] = useState(job.reviewOptOut);
  const [optOutError, setOptOutError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-soft">
        {job.reviewRequestedAt ? `Sent ${formatWhen(job.reviewRequestedAt)}` : "Not sent yet"}
        {job.email ? null : " · no email address on this job"}
      </p>
      <label htmlFor="review-opt-out" className="flex min-h-11 items-center gap-2">
        <input
          id="review-opt-out"
          type="checkbox"
          checked={optOut}
          disabled={isPending}
          onChange={(event) => {
            const next = event.target.checked;
            const previous = optOut;
            setOptOut(next);
            startTransition(async () => {
              try {
                await saveReviewOptOut(job.id, next);
                setOptOutError(null);
              } catch {
                setOptOut(previous);
                setOptOutError("Couldn't save that setting. Try again.");
              }
            });
          }}
        />
        Don&apos;t send a review request
      </label>
      {optOutError ? <p role="alert">{optOutError}</p> : null}
      {isInstalled(job.status) ? (
        <form action={action} className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={sending}>{sending ? "Sending…" : "Send now"}</Button>
          {state.error ? <p role="alert">{state.error}</p> : null}
          {state.ok ? <p role="status" className="text-ink-soft">Sent</p> : null}
        </form>
      ) : (
        <p className="text-ink-soft">The request goes out automatically the morning after installation.</p>
      )}
    </div>
  );
}

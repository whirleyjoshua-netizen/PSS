"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { formatWhen } from "@/lib/admin/time";
import { saveReviewOptOut, sendReviewNow, type FormState } from "../actions";

export function ReviewSection({ job }: { job: Job }) {
  const [state, action, sending] = useActionState<FormState, FormData>(sendReviewNow.bind(null, job.id), {});
  const [, startTransition] = useTransition();

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
          defaultChecked={job.reviewOptOut}
          onChange={(event) => {
            const optOut = event.target.checked;
            startTransition(() => saveReviewOptOut(job.id, optOut));
          }}
        />
        Don&apos;t send a review request
      </label>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={sending}>{sending ? "Sending…" : "Send now"}</Button>
        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-ink-soft">Sent</p> : null}
      </form>
    </div>
  );
}

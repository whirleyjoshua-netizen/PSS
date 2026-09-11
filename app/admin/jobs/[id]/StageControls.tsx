"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { ALL_STAGES, nextStage, stageLabel } from "@/lib/admin/stages";
import { markLost, moveStage, type FormState } from "../actions";

export function StageControls({ job }: { job: Job }) {
  const next = nextStage(job.status);
  const [lostState, lostAction, losing] = useActionState<FormState, FormData>(
    markLost.bind(null, job.id),
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        Stage: <span className="font-display text-charcoal">{stageLabel(job.status)}</span>
        {job.lostReason ? ` — ${job.lostReason}` : null}
      </p>

      {next ? (
        <form action={moveStage.bind(null, job.id, next)}>
          <Button type="submit" className="w-full sm:w-auto">Move to {stageLabel(next)}</Button>
        </form>
      ) : null}

      <form
        action={async (formData) => {
          const to = formData.get("stage");
          if (typeof to === "string" && to !== job.status) await moveStage(job.id, to as Job["status"]);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label htmlFor="set-stage" className="flex flex-col gap-1 text-sm">
          Set stage
          <select id="set-stage" name="stage" defaultValue={job.status} className="min-h-11 border border-rule bg-ivory px-3">
            {ALL_STAGES.filter((stage) => stage !== "lost").map((stage) => (
              <option key={stage} value={stage}>{stageLabel(stage)}</option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">Set</Button>
      </form>

      {job.status !== "lost" ? (
        <form action={lostAction} className="flex flex-wrap items-end gap-3">
          <label htmlFor="lost-reason" className="flex flex-1 flex-col gap-1 text-sm">
            Mark lost — reason
            <input id="lost-reason" name="reason" className="min-h-11 border border-rule bg-ivory px-3" />
          </label>
          <Button type="submit" variant="outline" disabled={losing}>Mark lost</Button>
          {lostState.error ? <p role="alert" className="w-full text-sm">{lostState.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { ALL_STAGES, nextStage, stageLabel } from "@/lib/admin/stages";
import { markLost, moveStage, type FormState } from "../actions";

export type StagePart = "status" | "move" | "set" | "lost";
const ALL_PARTS: readonly StagePart[] = ["status", "move", "set", "lost"];

/**
 * The stage line, next-stage button, set-stage select and mark-lost form.
 * The board's side panel shows the status line, Set stage and Mark lost; the
 * job page's "More actions" menu shows Set stage and Mark lost under
 * "Change stage…".
 */
export function StageControls({ job, parts = ALL_PARTS }: { job: Job; parts?: readonly StagePart[] }) {
  const show = (part: StagePart) => parts.includes(part);
  const next = nextStage(job.status);
  const [lostState, lostAction, losing] = useActionState<FormState, FormData>(
    markLost.bind(null, job.id),
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      {show("status") ? (
        <p className="text-sm text-ink-soft">
          Stage: <span className="font-display text-charcoal">{stageLabel(job.status)}</span>
          {job.lostReason ? ` — ${job.lostReason}` : null}
        </p>
      ) : null}

      {show("move") && next ? (
        <form action={moveStage.bind(null, job.id, next)}>
          <Button type="submit" variant="solid" className="w-full gap-2">
            <Icon name="arrow" className="size-4" />
            Move to {stageLabel(next)}
          </Button>
        </form>
      ) : null}

      {show("set") ? (
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
      ) : null}

      {show("lost") && job.status !== "lost" ? (
        <form
          key={lostState.values ? JSON.stringify(lostState.values) : "initial"}
          action={lostAction}
          className="flex flex-wrap items-end gap-3"
        >
          <label htmlFor="lost-reason" className="flex flex-1 flex-col gap-1 text-sm">
            Mark lost — reason
            <input
              id="lost-reason"
              name="reason"
              defaultValue={typeof lostState.values?.reason === "string" ? lostState.values.reason : ""}
              className="min-h-11 border border-rule bg-ivory px-3"
            />
          </label>
          <Button type="submit" variant="outline" disabled={losing}>Mark lost</Button>
          {lostState.error ? <p role="alert" className="w-full text-sm">{lostState.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

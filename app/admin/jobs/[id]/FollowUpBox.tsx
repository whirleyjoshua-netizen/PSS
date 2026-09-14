"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { FOLLOW_UP_NOTE_MAX, formatFollowUp, quickPicks } from "@/lib/admin/follow-up";
import { toLocalInput } from "@/lib/admin/time";
import { clearFollowUpAction, saveFollowUp } from "../follow-up-actions";
import type { FormState } from "../actions";

type FollowUpJob = { id: string; followUpAt?: Date | null; followUpNote?: string | null };

function DoneButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" disabled={pending}>Done</Button>;
}

/** The job's next call-back. Self-contained so the job page redesign can place it anywhere. */
export function FollowUpBox({ job }: { job: FollowUpJob }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFollowUp.bind(null, job.id), {});
  const [editing, setEditing] = useState(Boolean(state.error));
  const [editorKey, setEditorKey] = useState(0);
  const savedAt = job.followUpAt ? toLocalInput(job.followUpAt) : "";
  const initial = typeof state.values?.at === "string" ? state.values.at : savedAt;
  const [at, setAt] = useState(initial);
  const [now] = useState(() => Date.now());
  const followUpAt = job.followUpAt ?? null;
  const overdue = followUpAt ? followUpAt.getTime() < now : false;

  const cancel = () => {
    setAt(savedAt);
    setEditorKey((key) => key + 1);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {followUpAt ? (
        <p className="text-sm">
          Next call-back: {formatFollowUp(followUpAt, job.followUpNote ?? null)}
          {overdue ? <strong className="ml-2 font-semibold uppercase text-overdue">Overdue</strong> : null}
        </p>
      ) : (
        <p className="text-sm text-ink-soft">No call-back set</p>
      )}

      {editing ? (
        <form key={`${editorKey}:${state.values ? JSON.stringify(state.values) : "initial"}`} action={action} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {quickPicks(new Date()).map((pick) => (
              <button key={pick.label} type="button" onClick={() => setAt(pick.value)}
                className="min-h-11 border border-rule px-3 text-sm hover:border-charcoal">
                {pick.label}
              </button>
            ))}
          </div>
          <label htmlFor="follow-up-at" className="flex flex-col gap-2 text-sm">
            Call-back date and time
            <input id="follow-up-at" name="at" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <label htmlFor="follow-up-note" className="flex flex-col gap-2 text-sm">
            Reason
            <input id="follow-up-note" name="note" type="text" maxLength={FOLLOW_UP_NOTE_MAX}
              defaultValue={typeof state.values?.note === "string" ? state.values.note : job.followUpNote ?? ""}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="solid" disabled={pending}>Save call-back</Button>
            <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
          </div>
          {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>{followUpAt ? "Change" : "Set call-back"}</Button>
          {followUpAt ? (
            <form action={clearFollowUpAction.bind(null, job.id)}>
              <DoneButton />
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

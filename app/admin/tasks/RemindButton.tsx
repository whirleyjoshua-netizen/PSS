"use client";

import { useActionState } from "react";
import { remindTaskAction, type RemindState } from "./actions";

export function RemindButton({ taskId, title }: { taskId: string; title: string }) {
  const [state, action, sending] = useActionState<RemindState, FormData>(remindTaskAction.bind(null, taskId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={sending}
        aria-label={`Remind now: ${title}`}
        className="inline-flex min-h-11 items-center border border-charcoal px-3 text-sm text-charcoal hover:bg-charcoal hover:text-ivory disabled:opacity-60"
      >
        {sending ? "Sending…" : "Remind now"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">{state.error}</p>
      ) : state.ok ? (
        <p role="status" className="text-sm text-ink-soft">{state.ok}</p>
      ) : null}
    </form>
  );
}

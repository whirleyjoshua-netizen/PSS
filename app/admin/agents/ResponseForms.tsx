"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import type { AgentItem } from "@/lib/agents/rules";
import { decide, respondToReport, type CardState } from "./actions";

function Status({ state }: { state: CardState }) {
  return <p role="status" className="text-sm">{state.error ? <span className="text-red-700">{state.error}</span> : state.ok}</p>;
}

/** My response to a pending decision: an optional note (needed for a reply) and three choices. */
export function DecisionForm({ item, agentName }: { item: AgentItem; agentName: string }) {
  const [state, action, pending] = useActionState<CardState, FormData>(decide.bind(null, item.id), {});
  const noteId = `${item.id}-note`;
  return (
    <form action={action} className="flex flex-col gap-3">
      <Label htmlFor={noteId}>Note to {agentName} (needed for a reply)</Label>
      <textarea id={noteId} name="note" rows={3} className={CONTROL} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="choice" value="approved" disabled={pending}>Approve</Button>
        <Button type="submit" name="choice" value="declined" variant="outline" disabled={pending}>Decline</Button>
        <Button type="submit" name="choice" value="answered" variant="outline" disabled={pending}>Reply with note</Button>
      </div>
      <Status state={state} />
    </form>
  );
}

/** My response to a report: a note the agent reads on its next run. Sending again replaces it. */
export function ReportNoteForm({ item, agentName }: { item: AgentItem; agentName: string }) {
  const [state, action, pending] = useActionState<CardState, FormData>(respondToReport.bind(null, item.id), {});
  const noteId = `${item.id}-report-note`;
  return (
    <form action={action} className="flex flex-col gap-3">
      <Label htmlFor={noteId}>Note to {agentName}</Label>
      <textarea id={noteId} name="note" rows={4} maxLength={2000} defaultValue={item.ownerNote ?? ""} className={CONTROL} />
      <div>
        <Button type="submit" disabled={pending}>Send to {agentName}</Button>
      </div>
      <Status state={state} />
    </form>
  );
}

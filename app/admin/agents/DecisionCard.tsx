"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import type { AgentItem } from "@/lib/agents/rules";
import { decide, type CardState } from "./actions";

/** A question from an agent. The body arrives as children, rendered on the server, so react-markdown stays out of the client bundle. */
export function DecisionCard({ item, agentName, children }: { item: AgentItem; agentName: string; children?: React.ReactNode }) {
  const [state, action, pending] = useActionState<CardState, FormData>(decide.bind(null, item.id), {});
  const noteId = `${item.id}-note`;
  return (
    <article className="flex flex-col gap-3 border border-rule bg-ivory p-4" aria-label={`Decision from ${agentName}: ${item.title}`}>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-ink-soft">{agentName} · decision</p>
        <h3 className="font-semibold">{item.title}</h3>
        {item.reason && <p className="text-sm text-ink-soft">Why: {item.reason}</p>}
      </header>
      {children}
      <form action={action} className="flex flex-col gap-3">
        <Label htmlFor={noteId}>Note to {agentName} (needed for a reply)</Label>
        <textarea id={noteId} name="note" rows={3} className={CONTROL} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="choice" value="approved" disabled={pending}>Approve</Button>
          <Button type="submit" name="choice" value="declined" variant="outline" disabled={pending}>Decline</Button>
          <Button type="submit" name="choice" value="answered" variant="outline" disabled={pending}>Reply with note</Button>
        </div>
      </form>
      <p role="status" className="text-sm">{state.error ? <span className="text-red-700">{state.error}</span> : state.ok}</p>
    </article>
  );
}

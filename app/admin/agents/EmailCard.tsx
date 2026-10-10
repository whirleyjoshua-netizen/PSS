"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import type { AgentItem } from "@/lib/agents/rules";
import { approveAndSend, declineItem, saveEdits, type CardState } from "./actions";

/** What you see in the boxes, plus the footer shown below them, is exactly what gets sent. */
export function EmailCard({ item, agentName, footer }: { item: AgentItem; agentName: string; footer: string | null }) {
  const [sendState, send, sending] = useActionState<CardState, FormData>(approveAndSend.bind(null, item.id), {});
  const [editState, save, saving] = useActionState<CardState, FormData>(saveEdits.bind(null, item.id), {});
  const [declineState, decline, declining] = useActionState<CardState, FormData>(declineItem.bind(null, item.id), {});
  // Show the result of whichever button was pressed last, so a save that works clears an earlier send error.
  const [last, setLast] = useState<"send" | "save" | "decline" | null>(null);
  const pressed = (which: "send" | "save" | "decline", action: (form: FormData) => void) => (form: FormData) => {
    setLast(which);
    action(form);
  };
  const state = last === "send" ? sendState : last === "save" ? editState : last === "decline" ? declineState : {};
  const busy = sending || saving || declining;
  const id = (f: string) => `${item.id}-${f}`;
  const failed = item.status === "failed";
  return (
    <article className="flex flex-col gap-3 border border-rule bg-ivory p-4" aria-label={`Email from ${agentName}: ${item.title}`}>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-ink-soft">{agentName} · email{failed ? " · send failed" : ""}</p>
        <h3 className="font-semibold">{item.title}</h3>
        {item.reason && <p className="text-sm text-ink-soft">Why: {item.reason}</p>}
        {failed && item.error && <p role="alert" className="text-sm text-red-700">{item.error}</p>}
      </header>
      <form className="flex flex-col gap-3">
        <Label htmlFor={id("to")}>To</Label>
        <input id={id("to")} name="to" type="email" defaultValue={item.finalTo ?? item.emailTo ?? ""} className={CONTROL} required />
        <Label htmlFor={id("subject")}>Subject</Label>
        <input id={id("subject")} name="subject" defaultValue={item.finalSubject ?? item.emailSubject ?? ""} className={CONTROL} required />
        <Label htmlFor={id("body")}>Body</Label>
        <textarea id={id("body")} name="body" rows={10} defaultValue={item.finalBody ?? item.emailBody ?? ""} className={CONTROL} required />
        <p className="whitespace-pre-wrap text-xs text-ink-soft" aria-label="Added to every email">
          {footer ?? "Add a mailing address in Settings → Agents before this can be sent."}
        </p>
        {/* The send refuses unless this still matches the footer it would add. */}
        <input type="hidden" name="footer" value={footer ?? ""} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" formAction={pressed("send", send)} disabled={busy}>
            {failed ? "Retry send" : "Approve & send"}
          </Button>
          <Button type="submit" variant="outline" formAction={pressed("save", save)} disabled={busy}>Save edits</Button>
        </div>
      </form>
      <form action={pressed("decline", decline)} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor={id("note")}>Note to {agentName} (optional)</Label>
          <input id={id("note")} name="note" className={CONTROL} />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>Decline</Button>
      </form>
      <p role="status" className="text-sm">{state.error ? <span className="text-red-700">{state.error}</span> : state.ok}</p>
    </article>
  );
}

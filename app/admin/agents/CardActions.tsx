"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { decide, declineItem, type CardState } from "./actions";

function Status({ state }: { state: CardState }) {
  if (!state.error && !state.ok) return null;
  return <p role="status" className="text-sm">{state.error ? <span className="text-red-700">{state.error}</span> : state.ok}</p>;
}

/** A pending decision on its card: Approve or Decline with no note. A note is written in the reading pane (Expand). */
export function DecisionCardActions({ id, expandHref }: { id: string; expandHref: string }) {
  const [state, action, pending] = useActionState<CardState, FormData>(decide.bind(null, id), {});
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap gap-2">
        <Button type="submit" name="choice" value="approved" disabled={pending}>Approve</Button>
        <Button type="submit" name="choice" value="declined" variant="outline" disabled={pending}>Decline</Button>
        <ButtonLink href={expandHref} variant="outline">Expand</ButtonLink>
      </form>
      <Status state={state} />
    </div>
  );
}

/** A pending or failed email on its card. Nothing here sends: the card shows only an excerpt, and what is sent must be
 * what the owner saw, so sending happens in the reading pane ("Review & send"), where the whole email and footer show. */
export function EmailCardActions({ id, expandHref }: { id: string; expandHref: string }) {
  const [state, action, pending] = useActionState<CardState, FormData>(declineItem.bind(null, id), {});
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap gap-2">
        <ButtonLink href={expandHref}>Review &amp; send</ButtonLink>
        <Button type="submit" variant="outline" disabled={pending}>Decline</Button>
      </form>
      <Status state={state} />
    </div>
  );
}

"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { cancelAppointmentAction, confirmSchedule } from "../appointment-actions";
import type { FormState } from "../actions";

/**
 * Confirming is the step that emails the customer, so its result cannot be thrown away: a
 * confirmation whose email never went out says so here, beside the button that was pressed.
 */
export function ConfirmScheduleButton({ appointmentId, jobId }: { appointmentId: string; jobId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    confirmSchedule.bind(null, appointmentId, jobId), {},
  );
  return (
    <form action={action} className="contents">
      <Button type="submit" variant="solid" className="px-3" disabled={pending}>
        {pending ? "Confirming…" : "Confirm schedule"}
      </Button>
      {state.error ? <p role="alert" className="w-full text-xs text-overdue">{state.error}</p> : null}
    </form>
  );
}

/** Nothing to subscribe to: the store's only job is to differ between server and browser. */
const subscribeNothing = () => () => {};

const QUESTION = "Cancel this appointment? It will be removed from the calendar.";
const QUIET_BUTTON = "min-h-11 px-3 text-sm text-ink-soft underline underline-offset-4 disabled:opacity-60";

/**
 * Cancelling deletes the appointment and its Outlook event, and nothing here can put either back, so
 * it asks first — inline, naming the calendar removal. Without JavaScript the same question is a
 * <details> disclosure wrapping the real submit button. Nothing is emailed to the customer either way.
 */
export function CancelAppointmentButton({ appointmentId, jobId }: { appointmentId: string; jobId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    cancelAppointmentAction.bind(null, appointmentId, jobId), {},
  );
  const enhanced = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [confirming, setConfirming] = useState(false);

  const submit = (
    <form action={action} className="contents">
      <button type="submit" disabled={pending} className={QUIET_BUTTON}>
        {pending ? "Cancelling…" : "Yes, cancel"}
      </button>
    </form>
  );
  const alert = state.error ? <p role="alert" className="w-full text-xs text-overdue">{state.error}</p> : null;

  if (!enhanced) {
    return (
      <details>
        <summary className={`${QUIET_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Cancel</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2 border border-rule bg-ivory p-3">
          <p className="w-full text-xs">{QUESTION}</p>
          {submit}
          {alert}
        </div>
      </details>
    );
  }

  if (!confirming) {
    return (
      <>
        <button type="button" className={QUIET_BUTTON} onClick={() => setConfirming(true)}>Cancel</button>
        {alert}
      </>
    );
  }

  return (
    <>
      <p className="w-full text-xs">{QUESTION}</p>
      {submit}
      {/* Keep it posts nothing: it only puts the row back as it was. */}
      <button type="button" className={QUIET_BUTTON} onClick={() => setConfirming(false)}>Keep it</button>
      {alert}
    </>
  );
}

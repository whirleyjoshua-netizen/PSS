"use client";

import { useActionState, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { updateAppointmentNotes } from "../appointment-actions";
import type { FormState } from "../actions";
import { closeModal, openModal, subscribeNothing } from "./modal";

const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";
const QUIET_BUTTON = "min-h-11 px-3 text-sm text-ink-soft underline underline-offset-4";

/**
 * "Edit notes" on one appointment: its designer notes, and the client's gate code, without touching
 * its time — so it never sends a confirmed appointment back for confirmation. The action syncs
 * Outlook, which rewrites the event body of a confirmed appointment. Without JavaScript the same form
 * sits inside a <details> disclosure, which posts the action the ordinary way.
 */
export function NotesDialog({ appointmentId, jobId, designerNotes, gateCode }: {
  appointmentId: string;
  jobId: string;
  designerNotes: string | null;
  /** The client's gate code (null when there is none). Absent: no field, and the save leaves it alone. */
  gateCode?: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateAppointmentNotes.bind(null, appointmentId, jobId), {},
  );
  const enhanced = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  // One of these per appointment row, so the ids must be unique per instance.
  const uid = useId();
  useEffect(() => { if (state.ok) closeModal(dialog.current); }, [state]);
  // A failed save redraws what was typed: React 19 resets the form to these defaults after the action.
  const seeded = (name: "designerNotes" | "gateCode", fallback: string | null) => {
    const echoed = state.values?.[name];
    return typeof echoed === "string" ? echoed : fallback ?? "";
  };

  const fields = (
    <form action={action} className="flex flex-col gap-4 text-sm">
      {gateCode !== undefined ? (
        <label htmlFor={`notesGate-${uid}`} className="flex flex-col gap-2">
          Gate code
          <input id={`notesGate-${uid}`} name="gateCode" type="text" maxLength={40} autoComplete="off" className={CONTROL}
            defaultValue={seeded("gateCode", gateCode)} />
        </label>
      ) : null}
      <label htmlFor={`notes-${uid}`} className="flex flex-col gap-2">
        Designer notes
        <textarea id={`notes-${uid}`} name="designerNotes" rows={5} maxLength={2000} className={CONTROL}
          defaultValue={seeded("designerNotes", designerNotes)} />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="solid" disabled={pending}>{pending ? "Saving…" : "Save notes"}</Button>
        {enhanced ? (
          <button type="button" className="text-sm underline underline-offset-4"
            onClick={() => closeModal(dialog.current)}>Close</button>
        ) : null}
        {state.error ? <p role="alert" className="w-full text-sm text-overdue">{state.error}</p> : null}
      </div>
    </form>
  );

  if (!enhanced) {
    return (
      <details>
        <summary className={`${QUIET_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Edit notes</summary>
        <div className="mt-2 border border-rule bg-ivory p-3">{fields}</div>
      </details>
    );
  }

  return (
    <>
      <button type="button" className={QUIET_BUTTON} onClick={() => openModal(dialog.current)}>Edit notes</button>
      <dialog ref={dialog} aria-label="Edit notes" className="w-[min(28rem,92vw)] border border-rule bg-ivory p-5 backdrop:bg-charcoal/40">
        {fields}
      </dialog>
    </>
  );
}

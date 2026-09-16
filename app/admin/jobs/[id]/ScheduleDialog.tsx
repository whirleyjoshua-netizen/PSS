"use client";

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/admin/icons";
import { Button } from "@/components/ui/Button";
import { APPOINTMENT_KINDS, type AppointmentKind } from "@/lib/admin/appointment-kinds";
import { hoursLabel, WINDOW_OPTIONS } from "@/lib/routes/window";
import { bookAppointment } from "../appointment-actions";
import type { FormState } from "../actions";
import { ACTION_LINK } from "./ui";

const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";

/** Nothing to subscribe to: the store's only job is to differ between server and browser. */
const subscribeNothing = () => () => {};

// showModal/close are missing in jsdom and in very old browsers; the open attribute still shows the dialog.
function open(element: HTMLDialogElement | null) {
  if (!element) return;
  if (typeof element.showModal === "function") element.showModal();
  else element.setAttribute("open", "");
}

function close(element: HTMLDialogElement | null) {
  if (!element) return;
  if (typeof element.close === "function") element.close();
  else element.removeAttribute("open");
}

type Props = {
  jobId: string;
  /** What the trigger says: "Schedule" to book, "Reschedule" to move an existing appointment. */
  label?: string;
  kind?: AppointmentKind;
  /** The appointment being moved, as a datetime-local value. */
  startsAt?: string;
  allDay?: boolean;
  /** The arrival window being moved; null or absent is Any time. */
  windowStart?: string | null;
  windowEnd?: string | null;
  /** The length being moved; absent means the kind's default. */
  durationMinutes?: number | null;
  /** Each kind's usual length, which pre-fills Length until the owner types one. */
  defaultMinutes: Record<AppointmentKind, number>;
  className?: string;
};

/**
 * One booking, taken in a native modal. Without JavaScript the modal never appears and the same
 * form sits inside a <details> disclosure, which posts the action the ordinary way.
 */
export function ScheduleDialog({
  jobId, label = "Schedule", kind = "consultation", startsAt = "", allDay = false,
  windowStart = null, windowEnd = null, durationMinutes = null, defaultMinutes, className = ACTION_LINK,
}: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(bookAppointment.bind(null, jobId), {});
  // False on the server and through hydration, true once this is running in a browser — which is
  // exactly when the modal can work. Without JavaScript the <details> fallback is what ships.
  const enhanced = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  // The job page holds several of these (the header, the card, one per appointment), so the
  // field ids have to be unique per instance or the labels point at the wrong inputs.
  const uid = useId();
  // A saved booking is done with: close the modal so the refreshed card shows underneath.
  useEffect(() => { if (state.ok) close(dialog.current); }, [state]);
  // A length the owner typed, or one carried from the appointment being moved, stays put when the
  // kind changes; an untouched length follows the picked kind's default.
  const [touched, setTouched] = useState(durationMinutes != null);
  const [hours, setHours] = useState(hoursLabel(durationMinutes ?? defaultMinutes[kind]));

  const fields = (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <label htmlFor={`startsAt-${uid}`} className="flex flex-col gap-2">
        Date and time
        <input id={`startsAt-${uid}`} name="startsAt" type="datetime-local" className={CONTROL} defaultValue={startsAt} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2">What is this for?</legend>
        <div className="flex flex-wrap gap-2">
          {APPOINTMENT_KINDS.map((option) => (
            <label key={option.value} htmlFor={`kind-${uid}-${option.value}`}
              className="flex min-h-11 items-center gap-2 border border-rule px-3">
              <input id={`kind-${uid}-${option.value}`} type="radio" name="kind" value={option.value}
                defaultChecked={option.value === kind}
                onChange={() => { if (!touched) setHours(hoursLabel(defaultMinutes[option.value])); }} />
              <Icon name={option.icon} className="size-4" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`allDay-${uid}`} className="flex min-h-11 items-center gap-2">
        <input id={`allDay-${uid}`} type="checkbox" name="allDay" defaultChecked={allDay} />
        All day
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2">Arrival window</legend>
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor={`windowStart-${uid}`} className="flex flex-col gap-1">From
            <select id={`windowStart-${uid}`} name="windowStart" className={CONTROL} defaultValue={windowStart ?? ""}>
              <option value="">Any time</option>
              {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label htmlFor={`windowEnd-${uid}`} className="flex flex-col gap-1">To
            <select id={`windowEnd-${uid}`} name="windowEnd" className={CONTROL} defaultValue={windowEnd ?? ""}>
              <option value="">Any time</option>
              {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </fieldset>
      <label htmlFor={`hours-${uid}`} className="flex flex-col gap-2">
        Length (hours)
        <input id={`hours-${uid}`} name="hours" type="number" step="0.25" min="0.25" max="12" inputMode="decimal"
          className={CONTROL} value={hours} onChange={(e) => { setHours(e.target.value); setTouched(true); }} />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="solid" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {enhanced ? (
          <button type="button" className="text-sm underline underline-offset-4"
            onClick={() => close(dialog.current)}>Close</button>
        ) : null}
        {state.error ? <p role="alert" className="w-full text-sm text-overdue">{state.error}</p> : null}
      </div>
    </form>
  );

  if (!enhanced) {
    // No w-full: this sits in the header's wrapping action row, where the hydrated button does too.
    return (
      <details>
        <summary className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{label}</summary>
        <div className="mt-3 border border-rule bg-ivory p-4">{fields}</div>
      </details>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => open(dialog.current)}>{label}</button>
      <dialog ref={dialog} aria-label={label} className="w-[min(28rem,92vw)] border border-rule bg-ivory p-5 backdrop:bg-charcoal/40">
        {fields}
      </dialog>
    </>
  );
}

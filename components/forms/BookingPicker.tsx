"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import type { SlotDayView } from "@/lib/booking/labels";
import { CONTROL, Label } from "./Field";

/** A time the visitor chose, and where the visit is. The form sends both. */
export type PickedVisit = { start: string; label: string; address: string };

type Load = { state: "loading" } | { state: "ready"; days: SlotDayView[] } | { state: "unavailable" };

const CHIP = "flex min-h-11 flex-col items-center justify-center border px-3 py-2 text-sm transition-colors";
const ON = "border-charcoal bg-charcoal text-ivory";
const OFF = "border-rule bg-ivory text-charcoal hover:border-champagne-ink";

/**
 * The home form's "Book an Appointment" pop-up (owner 2026-10-20). It lists the open times from
 * /api/booking/slots, read live from the Outlook calendar, and asks for the street address the visit
 * goes to. Choosing hands both back to the form; nothing is booked until the form is sent.
 *
 * The dialog is portalled to <body> so it is never inside the consultation form: Enter in the
 * address field must not send the request.
 */
export function BookingPicker({ picked, onPick, idPrefix }: {
  picked: PickedVisit | null;
  onPick: (visit: PickedVisit | null) => void;
  idPrefix: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(picked?.start ?? null);
  const [address, setAddress] = useState(picked?.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && typeof element.showModal === "function" && !element.open) element.showModal();
    else element?.setAttribute("open", "");
    let live = true;
    fetch("/api/booking/slots", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ ok?: boolean; days?: SlotDayView[] }>)
      .then((result) => {
        if (!live) return;
        const days = result.ok && result.days ? result.days : null;
        if (!days || days.length === 0) return setLoad({ state: "unavailable" });
        setLoad({ state: "ready", days });
        // Reopening keeps the day already chosen while it is still offered.
        setDate((current) => (current && days.some((day) => day.date === current) ? current : days[0].date));
      })
      .catch(() => { if (live) setLoad({ state: "unavailable" }); });
    return () => { live = false; };
  }, [open]);

  function show() {
    setLoad({ state: "loading" });
    setOpen(true);
  }

  function close() {
    const element = dialog.current;
    if (element && typeof element.close === "function") element.close();
    setOpen(false);
  }

  function choose() {
    if (load.state !== "ready") return;
    const slot = load.days.flatMap((day) => day.slots.map((s) => ({ ...s, day }))).find((s) => s.start === start);
    if (!slot) return setError("Pick a time.");
    if (address.trim().length < 5) return setError("Please enter the street address for your visit.");
    onPick({ start: slot.start, label: `${slot.day.weekday}, ${slot.day.day} at ${slot.label}`, address: address.trim() });
    close();
  }

  const day = load.state === "ready" ? load.days.find((d) => d.date === date) ?? load.days[0] : null;

  return (
    <>
      {picked ? (
        <div className="flex flex-col gap-1 border border-champagne bg-sand/60 p-4 text-sm text-charcoal">
          <p className="font-display text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">Your visit</p>
          <p>{picked.label}</p>
          <p className="text-ink-soft">{picked.address}</p>
          <div className="mt-1 flex gap-4">
            <button type="button" className="underline underline-offset-4" onClick={show}>Change</button>
            <button type="button" className="text-ink-soft underline underline-offset-4" onClick={() => onPick(null)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="solid" className="w-full" onClick={show}>
          Book an Appointment
        </Button>
      )}

      {open
        ? createPortal(
          <dialog
            ref={dialog}
            aria-labelledby={headingId}
            onClose={() => setOpen(false)}
            className="m-auto max-h-[90vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto border border-rule bg-ivory p-6 text-charcoal shadow-xl backdrop:bg-charcoal/50"
          >
            <h2 id={headingId} className="font-display text-xl font-light tracking-tight">Pick a time for your visit.</h2>
            <p className="mt-1 text-sm text-ink-soft">
              About 90 minutes at your home. We bring the samples and measure every window.
            </p>

            {load.state === "loading" ? <p role="status" className="mt-6 text-sm text-ink-soft">Finding open times…</p> : null}

            {load.state === "unavailable" ? (
              <div className="mt-6 flex flex-col gap-4">
                <p role="alert" className="text-sm">
                  Online booking isn&apos;t available right now. Send your details and we&apos;ll call you to find a time.
                </p>
                <Button type="button" variant="outline" onClick={close}>Close</Button>
              </div>
            ) : null}

            {load.state === "ready" && day ? (
              <div className="mt-6 flex flex-col gap-5">
                <fieldset>
                  <legend className="font-display text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">Day</legend>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {load.days.map((d) => (
                      <button key={d.date} type="button" aria-pressed={d.date === day.date}
                        className={`${CHIP} shrink-0 ${d.date === day.date ? ON : OFF}`}
                        onClick={() => { setDate(d.date); setStart(null); setError(null); }}>
                        <span className="text-xs uppercase tracking-[0.12em]">{d.weekday}</span>
                        <span>{d.day}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="font-display text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">Time</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {day.slots.map((slot) => (
                      <button key={slot.start} type="button" aria-pressed={slot.start === start}
                        className={`${CHIP} ${slot.start === start ? ON : OFF}`}
                        onClick={() => { setStart(slot.start); setError(null); }}>
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${idPrefix}-visit-address`}>Street address</Label>
                  <input id={`${idPrefix}-visit-address`} autoComplete="street-address" maxLength={200} className={CONTROL}
                    value={address} onChange={(event) => { setAddress(event.target.value); setError(null); }}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); choose(); } }} />
                </div>

                {error ? <p role="alert" className="text-sm">{error}</p> : null}

                <div className="flex flex-wrap items-center gap-4">
                  <Button type="button" onClick={choose}>Use this time</Button>
                  <button type="button" className="text-sm underline underline-offset-4" onClick={close}>Cancel</button>
                </div>
              </div>
            ) : null}
          </dialog>,
          document.body,
        )
        : null}
    </>
  );
}

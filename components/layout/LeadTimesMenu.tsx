"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { leadTimes } from "@/content/lead-times";
import { trackLeadTimesOpen } from "@/lib/analytics/events";
import { formatShortDate, installWindow, isAfterDay, todayInLasVegas } from "@/lib/lead-times";
import type { Promo } from "@/lib/promo";

/**
 * "Lead times ▾" on the holiday strip. The panel is positioned against the strip's inner row (the nearest
 * positioned ancestor), so it spans the gutters on a phone and sits at the right on wider screens.
 *
 * Dates are worked out only when the panel opens, in the browser, from today in Las Vegas: the page is
 * prerendered, so dates in the HTML would be as old as the last deploy.
 */
export function LeadTimesMenu({ promo, pathname }: { promo: Promo; pathname: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const toggle = () => {
    if (!open) trackLeadTimesOpen(promo.id, pathname);
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap border border-holiday-snow/60 px-2.5 font-display text-xs uppercase tracking-[0.1em] transition-colors hover:bg-holiday-snow/15"
      >
        Lead times
        <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open ? <LeadTimesPanel ref={panel} id={panelId} promo={promo} onBook={() => setOpen(false)} /> : null}
    </>
  );
}

function LeadTimesPanel({
  ref,
  id,
  promo,
  onBook,
}: {
  ref: React.Ref<HTMLDivElement>;
  id: string;
  promo: Promo;
  onBook: () => void;
}) {
  const today = todayInLasVegas(new Date());

  return (
    <div
      ref={ref}
      id={id}
      className="absolute right-0 top-full z-[60] mt-3 w-full border border-rule bg-ivory p-4 text-charcoal shadow-lg sm:w-96"
    >
      <table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-display text-xs uppercase tracking-[0.14em] text-champagne-ink">
          Current lead times
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Lead time</th>
            <th scope="col">Installed around</th>
          </tr>
        </thead>
        <tbody>
          {leadTimes.map((leadTime) => {
            const { from, to } = installWindow(leadTime, today);
            const late = promo.arriveBy && isAfterDay(to, promo.arriveBy.day);
            return (
              <tr key={leadTime.label} className="border-t border-rule align-top">
                <th scope="row" className="py-2 pr-3 font-semibold">
                  {leadTime.label}
                </th>
                <td className="whitespace-nowrap py-2 pr-3 text-ink-soft">
                  {leadTime.minWeeks}–{leadTime.maxWeeks} weeks
                </td>
                <td className="py-2 text-right">
                  <span className="whitespace-nowrap">
                    {formatShortDate(from)} – {formatShortDate(to)}
                  </span>
                  {late ? <span className="block text-xs text-holiday-red">{promo.arriveBy!.note}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-soft">
        Install dates if you book today. Counted from your consult, when you order. Estimates, not guarantees.
      </p>
      <Link
        href={promo.href}
        onClick={onBook}
        className="mt-3 inline-block font-display text-xs font-medium uppercase tracking-[0.14em] text-champagne-ink underline underline-offset-4"
      >
        Book your free consult →
      </Link>
    </div>
  );
}

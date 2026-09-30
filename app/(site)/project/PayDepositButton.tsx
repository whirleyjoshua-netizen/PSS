"use client";

import { useFormStatus } from "react-dom";

/** Disabled while the post is in flight, so a double click sends one request where JavaScript runs. The server copes with two anyway. */
export function PayDepositButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory disabled:opacity-60"
    >
      {label}
    </button>
  );
}

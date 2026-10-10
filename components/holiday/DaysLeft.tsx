"use client";

import { useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};
// The minute, not the millisecond: a snapshot must stay the same between the reads of one render.
const nowMinute = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

/**
 * "36 days left" to the offer's end, counted in the visitor's browser so the prerendered page never shows a stale
 * number. Read with useSyncExternalStore (precedent: components/forms/ConsultationForm.tsx): the server snapshot is
 * null, so the HTML matches during hydration and the count appears right after. Nothing once the day has passed.
 */
export function DaysLeft({ endsAt, className }: { endsAt: string; className?: string }) {
  const minute = useSyncExternalStore(subscribeToNothing, nowMinute, serverMinute);
  if (minute === null) return null;
  const days = Math.ceil((new Date(endsAt).getTime() - minute * 60_000) / 86_400_000);
  if (days < 1) return null;
  return <span className={className}>{days === 1 ? "Last day to book" : `${days} days left to book`}</span>;
}

"use client";

import { useRef, useState } from "react";

const CONFIRM_WINDOW_MS = 4000;

/**
 * A submit button that requires two taps within 4 seconds before it actually
 * submits its form, so a stray tap on a phone can't delete a window or file.
 */
export function DeleteButton() {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (confirming) return; // second tap: let the form submit
    event.preventDefault();
    setConfirming(true);
    timer.current = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
  }

  return (
    <button
      type="submit"
      onClick={handleClick}
      className="min-h-11 inline-flex items-center px-3 text-ink-soft underline underline-offset-4"
    >
      {confirming ? "Tap again to delete" : "Delete"}
    </button>
  );
}

"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { beginFaceIdSignIn, completeFaceIdSignIn } from "./passkey-actions";
import { usePrefetchedOptions } from "./usePrefetchedOptions";

const FAILED = "Face ID sign-in didn't work. Try again, or use the email code.";
const GETTING_READY = "Getting Face ID ready…";
/** Set by TurnOnFaceId once this browser has a passkey. */
const MARKER = "pss_passkey";
const subscribeNothing = () => () => {};
/** The person closed the Face ID sheet, or it timed out: nothing went wrong. */
const cancelled = (error: unknown) =>
  error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError");

/** The passkey was removed (Settings), so the board may offer Face ID on this phone again. */
const forgetMarker = () => {
  try {
    window.localStorage.removeItem(MARKER);
  } catch {
    // Storage is only a convenience here.
  }
};

/** One tap: the phone's passkey sheet, Face ID, then the Jobs board. Nothing renders without passkeys. */
export function PasskeySignIn() {
  // False on the server and during hydration, so the markup always matches.
  const supported = useSyncExternalStore(subscribeNothing, browserSupportsWebAuthn, () => false);
  const prefetched = usePrefetchedOptions(beginFaceIdSignIn, supported);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Tapped while no options were in hand: asking for them, and saying so until they land.
  const [waiting, setWaiting] = useState(false);

  if (!supported) return null;

  const signIn = () => {
    const optionsJSON = prefetched.take();
    if (!optionsJSON) {
      // Already asked and still waiting: another tap would only start a parallel request.
      if (waiting && prefetched.isLoading()) return;
      // The last fetch failed. Ask again now; the passkey sheet comes on the next tap, once ready.
      setError(null);
      setWaiting(true);
      prefetched.refresh();
      return;
    }
    setWaiting(false);
    // Called inside the tap, before any await: iPhone Safari shows the passkey sheet only then.
    const answer = startAuthentication({ optionsJSON });
    setError(null);
    startTransition(async () => {
      let response;
      try {
        response = await answer;
      } catch (failure) {
        if (!cancelled(failure)) setError(FAILED);
        prefetched.refresh();
        return;
      }
      try {
        // On success the server redirects to the Jobs board, so only a failure comes back.
        const result = await completeFaceIdSignIn(response);
        if (result.forgetPasskey) forgetMarker();
        setError(result.error);
      } catch (failure) {
        // The redirect after a good sign-in arrives as a thrown error. The router handles it.
        unstable_rethrow(failure);
        setError(FAILED);
      }
      prefetched.refresh();
    });
  };

  // Off while the first options are on their way, or during an attempt. On once they land, and
  // also while a fetch has failed, so a tap can ask again.
  const off = pending || (!prefetched.ready && !prefetched.failed);
  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="solid" className="w-full" onClick={signIn} disabled={off}>
        {pending ? "Signing in…" : "Sign in with Face ID"}
      </Button>
      {waiting && !prefetched.ready ? <p role="status" className="text-sm text-ink-soft">{GETTING_READY}</p> : null}
      {error ? <p role="alert" className="text-sm text-charcoal">{error}</p> : null}
      <p className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-ink-soft">
        <span aria-hidden="true" className="h-px flex-1 bg-rule" />
        or use your email
        <span aria-hidden="true" className="h-px flex-1 bg-rule" />
      </p>
    </div>
  );
}

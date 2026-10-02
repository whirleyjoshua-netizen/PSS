"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { beginFaceIdSignIn, completeFaceIdSignIn } from "./passkey-actions";

const FAILED = "Face ID sign-in didn't work. Try again, or use the email code.";
const subscribeNothing = () => () => {};
/** The person closed the Face ID sheet, or it timed out: nothing went wrong. */
const cancelled = (error: unknown) =>
  error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError");

/** One tap: the phone's passkey sheet, Face ID, then the Jobs board. Nothing renders without passkeys. */
export function PasskeySignIn() {
  // False on the server and during hydration, so the markup always matches.
  const supported = useSyncExternalStore(subscribeNothing, browserSupportsWebAuthn, () => false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!supported) return null;

  const signIn = () => {
    setError(null);
    startTransition(async () => {
      let response;
      try {
        response = await startAuthentication({ optionsJSON: await beginFaceIdSignIn() });
      } catch (failure) {
        if (!cancelled(failure)) setError(FAILED);
        return;
      }
      // On success the server redirects to the Jobs board, so only a failure comes back.
      const result = await completeFaceIdSignIn(response);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="solid" className="w-full" onClick={signIn} disabled={pending}>
        {pending ? "Signing in…" : "Sign in with Face ID"}
      </Button>
      {error ? <p role="alert" className="text-sm text-charcoal">{error}</p> : null}
      <p className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-ink-soft">
        <span aria-hidden="true" className="h-px flex-1 bg-rule" />
        or use your email
        <span aria-hidden="true" className="h-px flex-1 bg-rule" />
      </p>
    </div>
  );
}

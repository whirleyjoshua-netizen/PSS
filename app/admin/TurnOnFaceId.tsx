"use client";

import { useEffect, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { beginFaceIdSetup, completeFaceIdSetup } from "./passkey-actions";
import { usePrefetchedOptions } from "./usePrefetchedOptions";

/** Set on this browser once it has a passkey, so the board stops offering it. */
const MARKER = "pss_passkey";
/** "Not now" hides the board card until the app is closed. */
const NOT_NOW = "pss_passkey_not_now";
const FAILED = "Face ID couldn't be turned on. Try again.";
const GETTING_READY = "Getting Face ID ready…";

// Storage can throw (private browsing, blocked site data). It is only ever a convenience here.
const read = (storage: () => Storage, key: string): string | null => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: () => Storage, key: string): void => {
  try {
    storage().setItem(key, "1");
  } catch {
    // Without storage the board may offer Face ID again. Harmless: this phone's passkey is excluded.
  }
};
const local = () => window.localStorage;
const session = () => window.sessionStorage;

const cancelled = (error: unknown) =>
  error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError");
/** The phone already holds a passkey for this person here (excludeCredentials matched). */
const alreadyOn = (error: unknown) => error instanceof Error && error.name === "InvalidStateError";

type View = "hidden" | "offer" | "on";

/**
 * Turns on Face ID sign-in for this device. On the Jobs board it is a card shown until this phone
 * has a passkey; in Settings it is a button that is always there when the device can do it.
 */
export function TurnOnFaceId({ place }: { place: "board" | "settings" }) {
  const [view, setView] = useState<View>("hidden");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Tapped while no options were in hand: asking for them, and saying so until they land.
  const [waiting, setWaiting] = useState(false);
  const noun = place === "board" ? "phone" : "device";
  // Fetched only while the button is offered, so a hidden card never creates a challenge.
  const prefetched = usePrefetchedOptions(beginFaceIdSetup, view === "offer");

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    if (place === "board" && (read(local, MARKER) || read(session, NOT_NOW))) return;
    let live = true;
    platformAuthenticatorIsAvailable().then(
      (available) => {
        if (live && available) setView("offer");
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [place]);

  if (view === "hidden") return null;

  const turnOn = () => {
    const optionsJSON = prefetched.take();
    if (!optionsJSON) {
      // The last fetch failed. Ask again now; the passkey sheet comes on the next tap, once ready.
      setError(null);
      setWaiting(true);
      prefetched.refresh();
      return;
    }
    setWaiting(false);
    // Called inside the tap, before any await: iPhone Safari shows the passkey sheet only then.
    const answer = startRegistration({ optionsJSON });
    setError(null);
    startTransition(async () => {
      let response;
      try {
        response = await answer;
      } catch (failure) {
        if (alreadyOn(failure)) {
          write(local, MARKER);
          setView("on");
          return;
        }
        if (!cancelled(failure)) setError(FAILED);
        prefetched.refresh();
        return;
      }
      let result;
      try {
        result = await completeFaceIdSetup(response);
      } catch (failure) {
        // A lapsed session redirects to sign-in. The router handles that.
        unstable_rethrow(failure);
        result = { error: FAILED };
      }
      if ("error" in result) {
        setError(result.error);
        prefetched.refresh();
        return;
      }
      write(local, MARKER);
      setView("on");
    });
  };

  const notNow = () => {
    write(session, NOT_NOW);
    setView("hidden");
  };

  // Off while the first options are on their way, or during an attempt. On once they land, and
  // also while a fetch has failed, so a tap can ask again.
  const off = pending || (!prefetched.ready && !prefetched.failed);
  const body =
    view === "on" ? (
      <p role="status" className="text-sm text-charcoal">Face ID is on for this {noun}</p>
    ) : (
      <>
        <Button type="button" variant="solid" onClick={turnOn} disabled={off}>
          {pending ? "Turning on…" : `Turn on Face ID for this ${noun}`}
        </Button>
        {waiting && !prefetched.ready ? <p role="status" className="text-sm text-ink-soft">{GETTING_READY}</p> : null}
        {error ? <p role="alert" className="text-sm text-charcoal">{error}</p> : null}
        {place === "board" ? (
          <button
            type="button"
            onClick={notNow}
            className="self-start text-sm text-ink-soft underline underline-offset-4 hover:text-charcoal"
          >
            Not now
          </button>
        ) : null}
      </>
    );

  if (place === "settings") return <div className="flex flex-col items-start gap-2">{body}</div>;
  return (
    <section aria-label="Face ID" className="flex flex-col gap-3 rounded-xl border border-rule bg-ivory p-4 shadow-sm">
      {view === "offer" ? (
        <p className="text-sm text-ink-soft">Sign back in with one look, without waiting for an email.</p>
      ) : null}
      {body}
    </section>
  );
}

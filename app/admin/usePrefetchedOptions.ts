"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Server options live 5 minutes. Fetch fresh ones a minute before that. */
export const OPTIONS_STALE_MS = 4 * 60 * 1000;

type Fetched<T> = { options: T; fetchedAt: number };

/**
 * Face ID options fetched before the tap. iPhone Safari only shows the passkey sheet when WebAuthn
 * is called inside the tap itself, so the button must already hold its options: no request may sit
 * between the tap and `startAuthentication`/`startRegistration`.
 *
 * Fetches while `enabled`, again ~4 minutes later (a timer, and on return to the page when the
 * timer was paused in the background), and again whenever `refresh` is called. `take` hands over
 * the options once and forgets them, so one set is never used twice. Call `refresh` once the
 * attempt is over (not before: a new fetch replaces the challenge the attempt is answering).
 */
export function usePrefetchedOptions<T>(fetchOptions: () => Promise<T | null>, enabled: boolean) {
  const [fetched, setFetched] = useState<Fetched<T> | null>(null);
  const [failed, setFailed] = useState(false);
  // Mirrors `fetched` for the click and the visibility listener, which must read it synchronously.
  const current = useRef<Fetched<T> | null>(null);
  const loading = useRef(false);
  // From `take` until the next `refresh`: an attempt is using the options, and its challenge cookie
  // must not be replaced under it.
  const inUse = useRef(false);
  // Each request gets a number. Only the latest may land, so a slow, older answer never wins.
  const latest = useRef(0);

  /** Starts a fetch. State changes only when it answers, so an effect may call this directly. */
  const load = useCallback(() => {
    const request = ++latest.current;
    inUse.current = false;
    loading.current = true;
    // A throw before the request even starts lands in the same failure path as a failed request.
    new Promise<T | null>((resolve) => resolve(fetchOptions())).then(
      (options) => {
        if (request !== latest.current) return;
        loading.current = false;
        if (!options) {
          setFailed(true);
          return;
        }
        const next = { options, fetchedAt: Date.now() };
        current.current = next;
        setFetched(next);
        setFailed(false);
      },
      () => {
        if (request !== latest.current) return;
        loading.current = false;
        setFailed(true);
      },
    );
  }, [fetchOptions]);

  /** Drops what is held and fetches afresh, so the button is off until new options land. */
  const refresh = useCallback(() => {
    current.current = null;
    setFetched(null);
    load();
  }, [load]);

  /** Ignores any answer still on its way. */
  const cancel = useCallback(() => {
    latest.current++;
    loading.current = false;
  }, []);

  const take = useCallback((): T | null => {
    const held = current.current;
    if (!held) return null;
    current.current = null;
    inUse.current = true;
    setFetched(null);
    return held.options;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || inUse.current) return;
      const held = current.current;
      // Stale options, or none and nothing on the way (the last fetch failed): fetch afresh.
      if (held ? Date.now() - held.fetchedAt >= OPTIONS_STALE_MS : !loading.current) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      cancel();
    };
  }, [enabled, load, refresh, cancel]);

  useEffect(() => {
    // Hidden (Not now) or done: nothing more is fetched.
    if (!fetched || !enabled) return;
    const timer = setTimeout(refresh, Math.max(0, OPTIONS_STALE_MS - (Date.now() - fetched.fetchedAt)));
    return () => clearTimeout(timer);
  }, [fetched, enabled, refresh]);

  return { ready: fetched !== null, failed, take, refresh };
}

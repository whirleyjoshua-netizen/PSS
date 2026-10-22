"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormMessage, Honeypot, TextField } from "@/components/forms/Field";
import { business } from "@/content/business";
import {
  LEAD_SENT_KEY, OFFER_DELAY_MS, OFFER_POPUP, OFFER_SEEN_KEY, liveOffers, type PopupOffer,
} from "@/content/offer-popup";
import { offerSignupSchema } from "@/lib/leads/schema";
import { recallAttribution } from "@/lib/leads/attribution";
import { trackOfferSignup } from "@/lib/analytics/events";

/** Pages that come after a lead, or belong to a customer: the pop-up would only get in the way. */
const HIDDEN_ON = ["/thank-you", "/project", "/unsubscribe"];

export function showsOfferPopup(pathname: string): boolean {
  return !HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function stored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function remember(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Private mode: it may show again next visit, which is all that is lost.
  }
}

/** Someone typing in a form, or with another dialog open (the booking pop-up), is never interrupted. */
function busy(): boolean {
  const active = document.activeElement;
  return Boolean(document.querySelector("dialog[open]")) || Boolean(active?.closest("input, textarea, select"));
}

/**
 * The offer pop-up (owner 2026-10-21, from the marketing consultant): a visitor not ready to book leaves a name and
 * email to get the offer, so we can follow up. It shows as soon as they land (OFFER_DELAY_MS).
 * It shows once per browser, never after any form was sent, and only while an offer runs.
 */
export function OfferPopup() {
  const pathname = usePathname();
  const path = useRef(pathname);
  const dialog = useRef<HTMLDialogElement>(null);
  const [offers, setOffers] = useState<PopupOffer[] | null>(null);
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();

  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (liveOffers(new Date()).length === 0 || stored(OFFER_SEEN_KEY) || stored(LEAD_SENT_KEY)) return;
    let done = false;
    let retry: number | undefined;
    const show = () => {
      if (done) return;
      if (!showsOfferPopup(path.current) || stored(LEAD_SENT_KEY)) return;
      if (busy()) {
        retry = window.setTimeout(show, 5_000);
        return;
      }
      const live = liveOffers(new Date());
      if (live.length === 0) return;
      done = true;
      cleanup();
      remember(OFFER_SEEN_KEY);
      setOffers(live);
    };
    const timer = window.setTimeout(show, OFFER_DELAY_MS);
    function cleanup() {
      window.clearTimeout(timer);
      window.clearTimeout(retry);
    }
    return cleanup;
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!offers || !element) return;
    if (typeof element.showModal === "function" && !element.open) element.showModal();
    else element.setAttribute("open", "");
  }, [offers]);

  function close() {
    const element = dialog.current;
    if (element && typeof element.close === "function") element.close();
    setOffers(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    const data = new FormData(event.currentTarget);
    const parsed = offerSignupSchema.safeParse({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      attribution: storedAttribution(),
      company: String(data.get("company") ?? ""),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details and try again.");
      setState("error");
      return;
    }
    setState("submitting");
    setError(null);
    try {
      const response = await fetch("/api/offer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) {
        setError(result?.error ?? "We could not send that. Please try again, or call us.");
        setState("error");
        return;
      }
      remember(LEAD_SENT_KEY);
      trackOfferSignup();
      setState("success");
    } catch {
      setError("We could not reach the server. Please check your connection or call us.");
      setState("error");
    }
  }

  if (!offers) return null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      onClose={() => setOffers(null)}
      // A tap on the dimmed backdrop closes it, like the close button.
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="m-auto max-h-[90vh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto border border-rule bg-ivory p-0 text-charcoal shadow-xl backdrop:bg-charcoal/50"
    >
      <div className="relative p-6">
        <button type="button" aria-label="Close" onClick={close}
          className="absolute right-2 top-2 flex size-11 items-center justify-center text-2xl leading-none text-ink-soft hover:text-charcoal">
          <span aria-hidden="true">×</span>
        </button>

        {state === "success" ? (
          <div role="status" className="flex flex-col gap-4 pr-8">
            <h2 id={headingId} className="font-display text-2xl font-light tracking-tight">{OFFER_POPUP.sentHeading}</h2>
            <p className="text-sm text-ink-soft">{OFFER_POPUP.sentBody}</p>
            <div className="flex flex-wrap items-center gap-4">
              <ButtonLink href="/#book" variant="solid">Book a time</ButtonLink>
              <a href={business.phone.href} className="text-sm underline underline-offset-4">{business.phone.display}</a>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <h2 id={headingId} className="pr-8 font-display text-2xl font-light tracking-tight">{OFFER_POPUP.heading}</h2>
            <div className="border-l-4 border-holiday-red bg-holiday-red/5 px-3 py-2">
              {offers.map((offer) => (
                <p key={offer.line} className="text-sm font-medium text-charcoal">{offer.line}</p>
              ))}
            </div>
            <p className="text-sm text-ink-soft">{OFFER_POPUP.intro}</p>
            <TextField id="offer-name" name="name" label="Name" autoComplete="name" required />
            <TextField id="offer-email" name="email" label="Email" type="email" inputMode="email" autoComplete="email" required />
            <Honeypot />
            <FormMessage state={state} error={error} phone={business.phone} successTitle="" successBody="" />
            <Button type="submit" disabled={state === "submitting"} className="w-full">
              {state === "submitting" ? "Sending…" : OFFER_POPUP.button}
            </Button>
            <button type="button" onClick={close} className="self-center text-sm text-ink-soft underline underline-offset-4">
              No thanks
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}

function storedAttribution() {
  try {
    return recallAttribution(window.localStorage);
  } catch {
    return undefined;
  }
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { trackPromoClick } from "@/lib/analytics/events";
import { promoStorageKey, type Promo } from "@/lib/promo";

/** Existing customers, and people who just asked for a consult, have no use for "book a consult". */
const NOT_SHOWN_ON = ["/project", "/thank-you"];

export function PromoBannerClient({ promo }: { promo: Promo }) {
  const pathname = usePathname() ?? "/";
  const [closed, setClosed] = useState(false);

  if (closed) return null;
  if (NOT_SHOWN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  const close = () => {
    try {
      window.localStorage.setItem(promoStorageKey(promo), "1");
    } catch {
      // Blocked storage: it closes for this visit only.
    }
    setClosed(true);
  };

  return (
    <aside
      aria-label="Holiday announcement"
      data-promo={promo.id}
      className="holiday-strip relative overflow-hidden border-b-[5px] border-holiday-green bg-holiday-red text-holiday-snow shadow-[inset_0_-7px_0_var(--color-champagne)]"
    >
      {/* A light snowfall: dots on a 22px grid, faint enough to keep the text 8.5:1. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-holiday-snow)_1.2px,transparent_1.6px)] bg-size-[22px_22px] opacity-15"
      />
      <Container>
        <div className="relative flex min-h-11 items-center justify-center gap-3 py-2 pr-10 pl-10 pb-3">
          <Snowflake />
          <Link
            href={promo.href}
            onClick={() => trackPromoClick(promo.id, pathname)}
            className="text-center text-sm leading-snug hover:underline"
          >
            <span className="sm:hidden">
              {promo.shortMessage} <span className="font-semibold underline underline-offset-2">{promo.shortCta}</span>
            </span>
            <span className="hidden sm:inline">
              {promo.message} <span className="font-semibold underline underline-offset-2">{promo.cta}</span>
            </span>
          </Link>
          <Snowflake />
          <button
            type="button"
            onClick={close}
            aria-label="Close holiday announcement"
            className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center text-xl leading-none transition-colors hover:bg-holiday-snow/15"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </Container>
    </aside>
  );
}

/** Decoration only; hidden on phones, where the message needs the width. */
function Snowflake() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="hidden size-4 shrink-0 sm:block">
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M10 1v18M2.2 5.5l15.6 9M2.2 14.5l15.6-9" />
        <path d="M7.5 2.8 10 5l2.5-2.2M7.5 17.2 10 15l2.5 2.2" />
      </g>
    </svg>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Snowflake } from "@/components/ui/Snowflake";
import { LeadTimesMenu } from "./LeadTimesMenu";
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
      className="holiday-strip relative border-b-[5px] border-holiday-green bg-holiday-red text-holiday-snow shadow-[inset_0_-7px_0_var(--color-champagne)]"
    >
      {/* A light snowfall: dots on a 22px grid, faint enough to keep the text 8.5:1. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-holiday-snow)_1.2px,transparent_1.6px)] bg-size-[22px_22px] opacity-15"
      />
      <Container>
        <div className="relative flex min-h-11 items-center gap-2 pt-1.5 pb-3">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
            {/* Hidden on phones, where the message needs the width. */}
            <Snowflake className="hidden size-4 sm:block" />
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
            <Snowflake className="hidden size-4 sm:block" />
          </div>
          <LeadTimesMenu promo={promo} pathname={pathname} />
          <button
            type="button"
            onClick={close}
            aria-label="Close holiday announcement"
            className="-mr-3 inline-flex size-11 shrink-0 items-center justify-center text-xl leading-none transition-colors hover:bg-holiday-snow/15"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </Container>
    </aside>
  );
}

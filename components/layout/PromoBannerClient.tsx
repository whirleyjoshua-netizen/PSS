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
    <aside aria-label="Holiday announcement" data-promo={promo.id} className="bg-champagne text-charcoal">
      <Container>
        <div className="relative flex min-h-11 items-center justify-center py-2 pr-10 pl-10">
          <Link
            href={promo.href}
            onClick={() => trackPromoClick(promo.id, pathname)}
            className="text-center text-sm leading-snug hover:underline"
          >
            <span className="sm:hidden">
              {promo.shortMessage} <span className="font-medium underline underline-offset-2">{promo.shortCta}</span>
            </span>
            <span className="hidden sm:inline">
              {promo.message} <span className="font-medium underline underline-offset-2">{promo.cta}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Close holiday announcement"
            className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center text-xl leading-none transition-colors hover:bg-charcoal/10"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </Container>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { business } from "@/content/business";

/** Pages that are the booking step already, or come after it: the bar would only cover their own form or content. */
const HIDDEN_ON = ["/contact", "/thank-you", "/project"];

export function showsBookBar(pathname: string): boolean {
  return !HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const BUTTON =
  "inline-flex min-h-12 items-center justify-center px-4 font-display text-sm font-medium uppercase tracking-[0.14em] transition-colors";

/**
 * Call and Invite Us Over, pinned to the bottom of the screen on phones. Invite Us Over links to /contact, but on a
 * page with its own booking form (#book: the homepage hero form, BookingBlock, TreatmentHero, /holiday) it scrolls
 * there instead. The page is looked up at the tap, so prerendering and client navigation never leave it stale. Taps on Call are counted by PhoneClickTracking's document listener, like every tel: link.
 */
function toBookingForm(event: React.MouseEvent<HTMLAnchorElement>) {
  // A new-tab, new-window or download click keeps the browser default: it opens /contact as asked.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const form = document.getElementById("book");
  if (!form) return;
  event.preventDefault();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(history.state, "", "#book");
  // Keyboard and screen-reader users land in the form too, not back on this button. preventScroll leaves the
  // smooth scroll above in charge; the html scroll-padding-bottom (app/globals.css) keeps the field clear of the bar.
  form.querySelector<HTMLElement>(FIRST_FIELD)?.focus({ preventScroll: true });
}

const FIRST_FIELD =
  "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

/** The bar's height, safe area included: --book-bar-height in app/globals.css, shared by the bar, its spacer and scroll-padding. */
export const BAR_HEIGHT = "h-(--book-bar-height)";

export function MobileBookBar() {
  const pathname = usePathname();
  if (!showsBookBar(pathname)) return null;
  return (
    <>
      {/* Holds the bar's height after the footer, so the bar never covers the end of the page. */}
      <div data-book-bar-spacer aria-hidden="true" className={`${BAR_HEIGHT} md:hidden`} />
      <nav
        aria-label="Book a consultation"
        className={`fixed inset-x-0 bottom-0 z-40 grid ${BAR_HEIGHT} grid-cols-2 gap-2 border-t border-rule bg-ivory/95 px-4 pt-[calc(0.5rem-1px)] pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur md:hidden`}
      >
        <a href={business.phone.href} className={`${BUTTON} border border-charcoal text-charcoal hover:bg-charcoal hover:text-ivory`}>
          Call
        </a>
        <Link href="/contact" onClick={toBookingForm} className={`${BUTTON} bg-champagne text-charcoal hover:bg-charcoal hover:text-ivory`}>
          Invite Us Over
        </Link>
      </nav>
    </>
  );
}

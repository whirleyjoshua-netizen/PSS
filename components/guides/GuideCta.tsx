"use client";

import Link from "next/link";
import { business } from "@/content/business";
import type { Guide } from "@/content/guides";
import { trackGuideCta } from "@/lib/analytics/events";

type Props =
  | { slug: string; variant: "inline"; cta: Guide["cta"] }
  | { slug: string; variant: "aside" };

/**
 * The bridge from "fix it" to a consult. The inline box sits after the steps
 * with the guide's own copy; the aside is pinned beside the article on wide
 * screens. A tap on the call button is also counted as phone_click by the
 * site-wide PhoneClickTracking listener; this adds which guide it came from.
 */
export function GuideCta(props: Props) {
  const { slug } = props;
  const inline = props.variant === "inline";

  return (
    <div className={`bg-charcoal text-ivory ${inline ? "my-12 p-6 md:p-8" : "p-5"}`}>
      <p className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne">
        {inline ? props.cta.eyebrow : "Free in-home measure"}
      </p>
      {inline ? (
        <h2 className="mt-2 text-2xl font-light text-ivory">{props.cta.headline}</h2>
      ) : null}
      <p className="mt-3 text-sand/80">
        {inline ? props.cta.body : "We bring samples to you anywhere in the Las Vegas valley."}
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <Link
          href="/contact"
          onClick={() => trackGuideCta(slug, "book")}
          className="inline-flex min-h-11 items-center justify-center bg-champagne px-5 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-ivory"
        >
          Book a free in-home measure
        </Link>
        <a
          href={business.phone.href}
          onClick={() => trackGuideCta(slug, "call")}
          className="inline-flex min-h-11 items-center justify-center border border-ivory/30 px-5 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-ivory transition-colors hover:border-ivory"
        >
          Call {business.phone.display}
        </a>
      </div>
    </div>
  );
}

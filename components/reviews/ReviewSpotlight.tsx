"use client";

import { useEffect, useState } from "react";
import { Section } from "@/components/ui/Section";
import { ownerName, pastWork, type PastReview } from "@/content/reviews";
import { formatReviewDate } from "./ReviewCard";

const INTERVAL_MS = 7000;

/**
 * One large quote at a time, crossfading. Auto-advance stops when paused and
 * never starts for reduced-motion users; while it runs the region is not
 * announced (a quote every seven seconds would talk over the page), and it
 * becomes a polite live region once the reader is in control.
 */
export function ReviewSpotlight({ reviews }: { reviews: PastReview[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setCurrent((index) => (index + 1) % reviews.length), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, reviews.length]);

  return (
    <Section tone="charcoal">
      <div className="flex max-w-4xl flex-col gap-8">
        <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne">
          In our clients&rsquo; words
        </p>

        <div className="grid" aria-live={paused ? "polite" : "off"}>
          {reviews.map((review, index) => (
            <figure
              key={`${review.name}-${review.date}`}
              aria-hidden={index !== current}
              className={`flex flex-col gap-6 transition-opacity duration-700 [grid-area:1/1] ${
                index === current ? "opacity-100" : "invisible opacity-0"
              }`}
            >
              <blockquote className="text-2xl leading-snug text-pretty text-ivory md:text-3xl">
                &ldquo;{review.quote}&rdquo;
              </blockquote>
              <figcaption className="font-display text-xs uppercase tracking-[0.16em] text-sand">
                {review.name} · {formatReviewDate(review.date)} · About {ownerName(review.about)}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex">
            {reviews.map((review, index) => (
              <button
                key={`${review.name}-${review.date}`}
                type="button"
                aria-label={`Quote ${index + 1} of ${reviews.length}`}
                aria-current={index === current || undefined}
                onClick={() => setCurrent(index)}
                className="grid size-11 place-items-center"
              >
                <span
                  className={`block h-0.5 w-6 transition-colors ${
                    index === current ? "bg-champagne" : "bg-ivory/30"
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
            className="inline-flex min-h-11 items-center justify-center border border-ivory/40 px-6 py-3 font-display text-sm font-medium uppercase tracking-[0.14em] text-ivory transition-colors duration-200 hover:bg-ivory hover:text-charcoal"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>

        <p className="text-sm leading-relaxed text-sand/75">
          From our work with {pastWork.source}, in Ohio and Las Vegas, before Premier Shade Solutions.
        </p>
      </div>
    </Section>
  );
}

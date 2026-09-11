"use client";

import { useState } from "react";
import type { PastReview } from "@/content/reviews";
import { ButtonLink } from "@/components/ui/Button";
import { ReviewCard } from "./ReviewCard";

/**
 * Rows of review cards drifting in opposite directions. Each row renders its
 * list twice so the loop is seamless; the copy is marked decorative so screen
 * readers hear every quote once. Hover pauses a row; the button pauses both,
 * for touch and keyboard users (WCAG 2.2.2). Reduced motion stops the drift
 * and lets the rows scroll instead — see app/globals.css.
 */
export function ReviewMarquee({ rows }: { rows: PastReview[][] }) {
  const [paused, setPaused] = useState(false);

  return (
    <>
      <div className={`mt-16 flex flex-col gap-6 ${paused ? "drift-paused" : ""}`}>
        {rows.map((row, index) => (
          <div key={index} className="drift-row">
            <div className={`flex w-max ${index % 2 ? "animate-drift-reverse" : "animate-drift"}`}>
              {row.map((review) => (
                <ReviewCard
                  key={`${review.name}-${review.date}`}
                  review={review}
                  className="mr-6 w-[300px] shrink-0 sm:w-[380px]"
                />
              ))}
              {row.map((review) => (
                <ReviewCard
                  key={`copy-${review.name}-${review.date}`}
                  review={review}
                  decorative
                  className="mr-6 w-[300px] shrink-0 sm:w-[380px]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap justify-center gap-4">
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="inline-flex min-h-11 items-center justify-center border border-taupe px-6 py-3 font-display text-sm font-medium uppercase tracking-[0.14em] text-ink-soft transition-colors duration-200 hover:bg-taupe hover:text-ivory"
        >
          {paused ? "Play reviews" : "Pause reviews"}
        </button>
        <ButtonLink href="/reviews" variant="outline">
          Read every review
        </ButtonLink>
      </div>
    </>
  );
}

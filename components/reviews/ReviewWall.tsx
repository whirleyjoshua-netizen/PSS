"use client";

import { useState } from "react";
import { pastWork, type PastReview } from "@/content/reviews";
import { ReviewCard } from "./ReviewCard";

type Filter = "all" | PastReview["about"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Josh", label: "Josh" },
  { id: "Shade", label: "Shade" },
];

export function ReviewWall({ reviews }: { reviews: PastReview[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? reviews : reviews.filter((review) => review.about === filter);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-y border-rule py-4">
        <div role="group" aria-label="Show reviews about" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`inline-flex min-h-11 items-center justify-center border border-charcoal px-6 py-3 font-display text-sm font-medium uppercase tracking-[0.14em] transition-colors duration-200 ${
                filter === option.id
                  ? "bg-charcoal text-ivory"
                  : "text-charcoal hover:bg-charcoal hover:text-ivory"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="text-sm tabular-nums text-ink-soft">
          Showing {shown.length} written reviews · {pastWork.averageRating} average across{" "}
          {pastWork.surveys} surveys
        </p>
      </div>

      <div className="mt-12 columns-1 gap-8 sm:columns-2 lg:columns-3">
        {shown.map((review) => (
          <ReviewCard
            key={`${review.about}-${review.name}-${review.date}`}
            review={review}
            tone="sand"
            className="mb-8 break-inside-avoid"
          />
        ))}
      </div>
    </>
  );
}

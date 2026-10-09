import { ownerName, type PastReview } from "@/content/reviews";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-03" -> "Mar 2024". No Date parsing, so server and client always agree. */
export function formatReviewDate(date: string) {
  const [year, month] = date.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

export function Stars() {
  return (
    <div role="img" aria-label="5 out of 5 stars" className="flex gap-[3px]">
      {[0, 1, 2, 3, 4].map((index) => (
        <svg key={index} viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-champagne">
          <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7.1L12 17.5 5.8 21.3l1.6-7.1L2 9.5l7.1-.6z" />
        </svg>
      ))}
    </div>
  );
}

export function ReviewCard({
  review,
  tone = "ivory",
  decorative = false,
  className,
}: {
  review: PastReview;
  tone?: "ivory" | "sand";
  /** A visual duplicate (the drifting rows repeat their list); hidden from screen readers. */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <article
      aria-hidden={decorative || undefined}
      className={`flex flex-col gap-4 p-8 ${tone === "ivory" ? "bg-ivory" : "bg-sand"} ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <Stars />
        <p className="font-display text-[11px] font-medium uppercase tracking-[0.16em] text-champagne-ink">
          About {ownerName(review.about)}
        </p>
      </div>
      <p className="text-base leading-relaxed text-pretty text-charcoal">&ldquo;{review.quote}&rdquo;</p>
      <p className="mt-auto font-display text-xs uppercase tracking-[0.16em] text-ink-soft">
        {review.name} · {formatReviewDate(review.date)}
      </p>
    </article>
  );
}

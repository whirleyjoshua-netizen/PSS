import Link from "next/link";
import { formatReviewDate, Stars } from "@/components/reviews/ReviewCard";
import { Reveal } from "@/components/ui/Reveal";
import { pastReviews, pastWork } from "@/content/reviews";

/** The first About-page spotlight quote; a fixed pick so the page is the same for every visitor. */
export const FEATURED_REVIEW = pastReviews.filter((review) => review.spotlight)[0];

/** The other spotlight reviews, for a page's reviews band under the featured card: no quote shows twice. */
export const spotlightReviewsExceptFeatured = pastReviews.filter(
  (review) => review.spotlight && review !== FEATURED_REVIEW,
);

/** One past-work review on a card with stars, labelled as from before Premier Shade Solutions (FTC). */
export function FeaturedReviewCard({ className }: { className?: string }) {
  if (!FEATURED_REVIEW) return null;
  return (
    <Reveal delayMs={150} className={className}>
      <figure className="flex flex-col gap-3 bg-ivory/95 p-5 shadow-xl backdrop-blur-sm">
        <Stars />
        <blockquote className="text-sm leading-relaxed text-charcoal">
          &ldquo;{FEATURED_REVIEW.quote}&rdquo;
        </blockquote>
        <figcaption className="text-xs leading-relaxed text-ink-soft">
          {FEATURED_REVIEW.name} · {formatReviewDate(FEATURED_REVIEW.date)} · About {FEATURED_REVIEW.about}. From
          our years with {pastWork.source}, before we opened Premier Shade Solutions.{" "}
          <Link href="/reviews" className="underline underline-offset-4 hover:text-charcoal">
            Read every review
          </Link>
        </figcaption>
      </figure>
    </Reveal>
  );
}

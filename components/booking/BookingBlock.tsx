import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { HeroForm } from "@/components/forms/HeroForm";
import { formatReviewDate } from "@/components/reviews/ReviewCard";
import type { ServiceCity } from "@/content/business";
import type { Photo } from "@/content/products";
import { pastReviews, pastWork } from "@/content/reviews";

export const FAMILY_LINE =
  "Shade and Josh measure, order and install every job themselves. No call center, no subcontractors.";

/** The first About-page spotlight quote; a fixed pick so the page is the same for every visitor. */
const featured = pastReviews.filter((review) => review.spotlight)[0];

/**
 * The short booking form with a photo, the family line and one past-work review.
 * It sits directly under the hero on every page an ad can land on (spec §8), so
 * on a phone the form is the first thing after the page title. The form comes
 * first in the markup and moves to the right on wide screens.
 */
export function BookingBlock({
  photo,
  city,
  heading,
  treatment,
  showReview = true,
}: {
  photo: Photo;
  city?: ServiceCity;
  heading?: string;
  /** The page's category name, sent as the lead's treatment (see HeroForm). */
  treatment?: string;
  /** False on /reviews, which already shows every review; the quote would link the page to itself. */
  showReview?: boolean;
}) {
  return (
    <Section tone="sand" id="book" className="scroll-mt-20">
      {heading ? (
        <h2 className="mb-10 text-3xl font-light tracking-tight text-charcoal">{heading}</h2>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-16">
        <HeroForm
          idPrefix="book"
          source="booking"
          city={city}
          treatment={treatment}
          className="lg:order-2"
        />

        <div className="flex flex-col gap-6 lg:order-1">
          <div className="relative aspect-4/3 w-full overflow-hidden bg-ivory">
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 1024px) 40rem, 100vw"
              className="object-cover"
            />
          </div>

          <p className="text-lg leading-relaxed text-charcoal">{FAMILY_LINE}</p>

          {showReview && featured ? (
            <figure className="flex flex-col gap-3 border-l-2 border-champagne pl-5">
              <blockquote className="text-ink-soft">&ldquo;{featured.quote}&rdquo;</blockquote>
              <figcaption className="text-xs text-ink-soft">
                {featured.name} · {formatReviewDate(featured.date)} · About {featured.about}. From
                our years with {pastWork.source}, before we opened Premier Shade Solutions.{" "}
                <Link href="/reviews" className="underline underline-offset-4 hover:text-charcoal">
                  Read every review
                </Link>
              </figcaption>
            </figure>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

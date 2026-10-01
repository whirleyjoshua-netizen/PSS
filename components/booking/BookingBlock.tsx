import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { HeroForm } from "@/components/forms/HeroForm";
import { formatReviewDate, Stars } from "@/components/reviews/ReviewCard";
import { Reveal } from "@/components/ui/Reveal";
import type { ServiceCity } from "@/content/business";
import type { Photo } from "@/content/products";
import { pastReviews, pastWork } from "@/content/reviews";

export const FAMILY_LINE =
  "Shade and Josh measure, order and install every job themselves. No call center, no subcontractors.";

/** The first About-page spotlight quote; a fixed pick so the page is the same for every visitor. */
const featured = pastReviews.filter((review) => review.spotlight)[0];

/** The badges under the photo: what the consultation is, in three words or fewer each. */
const PROMISES = ["Free consultation", "Family-run", "No obligation"];

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
    <Section tone="sand" id="book" padding="tight-top" className="scroll-mt-20 overflow-hidden">
      {heading ? (
        <h2 className="mb-10 text-3xl font-light tracking-tight text-charcoal">{heading}</h2>
      ) : null}

      {/* One grid row on wide screens: the photo column spans 1-8 and the form
          spans 8-12, so the form card overlaps the photo's right edge. The form
          stays first in the markup, so on a phone it comes first. */}
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-0">
        <HeroForm
          idPrefix="book"
          source="booking"
          city={city}
          treatment={treatment}
          className="relative z-10 border-t-4 border-champagne lg:col-start-8 lg:col-end-13 lg:row-start-1 lg:mt-16 lg:self-start lg:shadow-2xl"
        />

        <div className="flex flex-col gap-6 lg:col-start-1 lg:col-end-9 lg:row-start-1">
          <div className="relative">
            <div className="relative aspect-4/3 w-full overflow-hidden bg-ivory shadow-xl lg:aspect-16/10">
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(min-width: 1024px) 66vw, 100vw"
                className="animate-slow-zoom object-cover"
              />
            </div>

            {showReview && featured ? (
              <Reveal
                delayMs={150}
                className="relative -mt-14 mx-4 sm:mx-8 lg:absolute lg:bottom-8 lg:left-8 lg:m-0 lg:max-w-sm"
              >
                <figure className="flex flex-col gap-3 bg-ivory/95 p-5 shadow-xl backdrop-blur-sm">
                  <Stars />
                  <blockquote className="text-sm leading-relaxed text-charcoal">
                    &ldquo;{featured.quote}&rdquo;
                  </blockquote>
                  <figcaption className="text-xs leading-relaxed text-ink-soft">
                    {featured.name} · {formatReviewDate(featured.date)} · About {featured.about}. From
                    our years with {pastWork.source}, before we opened Premier Shade Solutions.{" "}
                    <Link href="/reviews" className="underline underline-offset-4 hover:text-charcoal">
                      Read every review
                    </Link>
                  </figcaption>
                </figure>
              </Reveal>
            ) : null}
          </div>

          <Reveal className="flex flex-col gap-5 lg:pr-24">
            <ul aria-label="What you get" className="flex flex-wrap gap-2">
              {PROMISES.map((promise) => (
                <li
                  key={promise}
                  className="inline-flex items-center gap-2 border border-champagne/70 bg-ivory/70 px-3 py-1.5 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-none stroke-champagne-ink stroke-[2.5]">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  {promise}
                </li>
              ))}
            </ul>
            <p className="text-lg leading-relaxed text-charcoal">{FAMILY_LINE}</p>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

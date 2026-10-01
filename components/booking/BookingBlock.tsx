import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { HeroForm } from "@/components/forms/HeroForm";
import type { ServiceCity } from "@/content/business";
import type { Photo } from "@/content/products";
import { FAMILY_LINE, PromiseRow } from "./PromiseRow";
import { FeaturedReviewCard } from "./FeaturedReview";

export { FAMILY_LINE };

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

            {showReview ? (
              <FeaturedReviewCard className="relative -mt-14 mx-4 sm:mx-8 lg:absolute lg:bottom-8 lg:left-8 lg:m-0 lg:max-w-sm" />
            ) : null}
          </div>

          <PromiseRow className="lg:pr-24" />
        </div>
      </div>
    </Section>
  );
}

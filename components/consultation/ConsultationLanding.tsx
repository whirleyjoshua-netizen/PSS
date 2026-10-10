import { ConsultationCta } from "@/components/product/ProductParts";
import { TreatmentHero } from "@/components/treatment/TreatmentHero";
import { PromiseRow } from "@/components/booking/PromiseRow";
import { spotlightReviewsExceptFeatured } from "@/components/booking/FeaturedReview";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { Section } from "@/components/ui/Section";
import { FAQ, landingTitle } from "@/content/consultation";
import { HowItWorks, PainsSection, QuestionsSection } from "./LandingSections";
import type { Photo } from "@/content/products";

/**
 * The ad landing page (spec 2026-10-08): the form first, then the five things
 * customers say go wrong with window companies and how we do each one, the
 * reviews, the four steps, the questions, and the form link again. No
 * breadcrumbs and no product grid: an ad visitor has one thing to do here.
 */
export function ConsultationLanding({
  photo,
  noun,
  treatment,
}: {
  photo: Photo;
  /** "Shutters", "Motorized Shades"…; unset on the general page. */
  noun?: string;
  /** The category name the lead is filed under; unset on the general page. */
  treatment?: string;
}) {
  return (
    <>
      <TreatmentHero
        photo={photo}
        eyebrow="Free in-home consultation · Las Vegas valley"
        title={landingTitle(noun)}
        lead="Josh measures every window himself, and we guarantee it. Your lead time is on your quote, and you text the owners, not a call center."
        treatment={treatment ?? ""}
      />

      <Section tone="sand" className="!py-10">
        <PromiseRow centered />
      </Section>

      <PainsSection />

      <ReviewSpotlight reviews={spotlightReviewsExceptFeatured} />

      <HowItWorks />

      <QuestionsSection faq={FAQ} />

      <ConsultationCta
        href="#book"
        title="Ready when you are."
        body="Samples in your own light, every window measured by the owner, and a written quote with your lead time on it."
      />
    </>
  );
}

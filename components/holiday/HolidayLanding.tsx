import { ConsultationCta } from "@/components/product/ProductParts";
import { HowItWorks, PainsSection, QuestionsSection } from "@/components/consultation/LandingSections";
import { spotlightReviewsExceptFeatured } from "@/components/booking/FeaturedReview";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { Section } from "@/components/ui/Section";
import { FAQ } from "@/content/consultation";
import { holidayPhoto } from "@/content/gallery";
import { HOLIDAY_ICONS, holidayFaq } from "@/content/holiday";
import { HolidayHero } from "./HolidayHero";

const ICONS = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  sparkle: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
};

/** The holiday ad landing page (spec 2026-10-10): the flyer's look up top, then the proven /consultation sections. */
export function HolidayLanding({ stage }: { stage: "offer" | "family" }) {
  return (
    <>
      <HolidayHero stage={stage} photo={holidayPhoto} />

      <Section tone="sand" className="!py-10">
        <ul className="grid grid-cols-3 divide-x divide-rule text-center">
          {HOLIDAY_ICONS.map(({ label, icon }) => (
            <li key={label} className="flex flex-col items-center gap-2 px-2">
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-champagne-ink stroke-[1.5]" aria-hidden="true">
                {ICONS[icon]}
              </svg>
              <span className="font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal sm:text-sm">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <PainsSection />
      <ReviewSpotlight reviews={spotlightReviewsExceptFeatured} />
      <HowItWorks />
      <QuestionsSection faq={[...holidayFaq(stage), ...FAQ]} />

      <ConsultationCta
        href="#book"
        title="Ready for the holidays?"
        body="Samples in your own light, every window measured by the owner, and a written quote with your lead time on it."
      />
    </>
  );
}

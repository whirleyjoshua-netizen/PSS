import { Section, SectionHeading } from "@/components/ui/Section";
import { pastReviews, pastWork } from "@/content/reviews";
import { ReviewMarquee } from "./ReviewMarquee";

/** Longer quotes carry the drifting rows; one-word ones read as filler at that size. */
const rowOf = (about: "Josh" | "Shade") =>
  pastReviews.filter((review) => review.about === about && review.quote.length > 40).slice(0, 8);

export function PastWorkReviews() {
  return (
    <Section tone="sand">
      <div className="flex flex-wrap items-end justify-between gap-12">
        <SectionHeading
          eyebrow="Before Premier Shade"
          title="You are hiring the two of us. Here is what our clients said."
          lead={`Every review below is from our years installing and designing for ${pastWork.source}, in Ohio and here in Las Vegas, before we opened Premier Shade Solutions.`}
        />
        <dl className="flex gap-14">
          <div className="flex flex-col-reverse gap-1">
            <dt className="text-sm text-ink-soft">Average rating out of 5</dt>
            <dd className="font-display text-5xl font-light tabular-nums text-charcoal md:text-6xl">
              {pastWork.averageRating}
            </dd>
          </div>
          <div className="flex flex-col-reverse gap-1">
            <dt className="text-sm text-ink-soft">Client surveys</dt>
            <dd className="font-display text-5xl font-light tabular-nums text-charcoal md:text-6xl">
              {pastWork.surveys}
            </dd>
          </div>
        </dl>
      </div>

      <ReviewMarquee rows={[rowOf("Josh"), rowOf("Shade")]} />
    </Section>
  );
}

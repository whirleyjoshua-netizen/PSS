import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { business } from "@/content/business";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { pastReviews } from "@/content/reviews";

export const metadata: Metadata = {
  title: "About Us | Premier Shade Solutions",
  description:
    "Premier Shade Solutions is a husband-and-wife window treatment company serving the Las Vegas valley. We measure and install every job ourselves.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Who we are"
        title="A husband-and-wife shop in Las Vegas"
        lead="The people who answer the phone are the people who measure your windows and hang your shades."
        trail={[{ name: "About", url: "/about" }]}
      />

      <Section tone="ivory" containerWidth="prose">
        {/* TODO(content): replace the three paragraphs below with the owners'
            own words. How the two of you started, why window treatments, what
            you care about getting right. This is the highest-converting page
            on the site and the one thing competitors cannot copy — it should
            sound like you, not like a website. */}
        <div className="flex flex-col gap-6 text-lg leading-relaxed text-ink-soft">
          <p>
            Premier Shade Solutions is the two of us. There is no call center,
            no rotating crew of subcontractors, and no salesperson working
            toward a monthly target. When you call, you get an owner. When we
            measure, we are the ones who will be hanging it. And when something
            needs to be made right, you are already talking to the people who
            can decide to make it right.
          </p>
          <p>
            We work across the Las Vegas valley — {business.serviceArea.join(", ")} —
            and we specify for this climate specifically. West-facing glass here
            destroys products that would last a decade somewhere milder. Part of
            our job is telling you which of those to avoid, even when the
            cheaper or the more expensive option is the one that lasts.
          </p>
          <p>
            Every job starts the same way: we come to you, at no charge, with
            real samples. We look at the exposure, the room, and what you
            actually need the window to do. Then we measure every opening and
            leave you with a quote before we go.
          </p>
        </div>
      </Section>

      <ReviewSpotlight reviews={pastReviews.filter((review) => review.spotlight)} />

      <Section tone="sand" containerWidth="prose">
        <h2 className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
          How a job goes
        </h2>
        <ol className="mt-8 flex flex-col gap-8">
          {[
            {
              title: "The consultation",
              body: "We come to your home with samples, look at every window you are considering, and talk through what each room needs. Free, and there is no obligation at the end of it.",
            },
            {
              title: "Measurement and quote",
              body: "We measure every opening ourselves — the single most common cause of a bad window treatment is a bad measurement — and give you a written quote before we leave.",
            },
            {
              title: "Order and build",
              body: "Everything is made to your openings. We keep you posted on lead time, and we tell you promptly if a vendor slips.",
            },
            {
              title: "Installation",
              body: "We install what we sold you, clean up after ourselves, and show you how everything operates before we go.",
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-6">
              <span
                aria-hidden="true"
                className="font-display text-sm text-champagne-ink"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-lg font-light tracking-tight text-charcoal">
                  {step.title}
                </h3>
                <p className="text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <ConsultationCta />
    </>
  );
}

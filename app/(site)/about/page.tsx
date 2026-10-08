import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { pastReviews } from "@/content/reviews";

export const metadata: Metadata = {
  title: "Meet the Family | Premier Shade Solutions",
  description:
    "Premier Shade Solutions is a family-run window treatment company serving the Las Vegas valley. Shade designs, Josh installs, and we handle every job ourselves.",
  alternates: { canonical: "/about" },
};

/** The only page the children appear on (family brand spec §1). */
export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Who we are"
        title="Meet the family"
        trail={[{ name: "About", url: "/about" }]}
      />

      <Section tone="ivory">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,64ch)_minmax(0,24rem)] lg:gap-16">
          <div className="flex flex-col gap-6 text-lg leading-relaxed text-ink-soft">
            <p>
              <strong className="font-medium text-charcoal">It started with Josh&rsquo;s dad.</strong>{" "}
              He installed window treatments across Los Angeles, and Josh grew up on those jobs —
              learning to measure, mount and finish a window before most kids had a summer job. His
              dad has since passed, and a lot of how we work comes straight from him: do it right, do
              it yourself, and stand behind it.
            </p>
            <p>
              <strong className="font-medium text-charcoal">Shade found the design side.</strong>{" "}
              With Josh&rsquo;s encouragement she started designing, and she fell in love with it —
              not just the fabrics and the finishes, but the people: sitting down in someone&rsquo;s
              home, listening, and helping them get it exactly right. She became a top designer,
              first in Ohio and now here in Las Vegas.
            </p>
            <p>
              <strong className="font-medium text-charcoal">Now it&rsquo;s our family&rsquo;s business.</strong>{" "}
              Shade designs, Josh installs, and our kids are growing up around it the way Josh did.
              When you invite us into your home, you&rsquo;re working with us — not a call center,
              not a rotating crew.
            </p>
            <p className="font-display text-2xl font-light text-charcoal">
              You let us into your home. We let you into our family.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="relative aspect-4/5 w-full overflow-hidden bg-sand">
              <Image
                src="/brand/josh-with-kids.webp"
                alt="Josh sitting in an armchair with their baby son and young daughter on his lap, all three in black, the daughter smiling in green sneakers"
                fill
                sizes="(min-width: 1024px) 24rem, 100vw"
                className="object-cover"
              />
            </div>
            <div className="relative aspect-4/5 w-full overflow-hidden bg-sand">
              <Image
                src="/brand/shade-with-kids.webp"
                alt="Shade smiling in an armchair with their baby son and young daughter on her lap, the daughter grinning with a hand to her cheek"
                fill
                sizes="(min-width: 1024px) 24rem, 100vw"
                className="object-cover"
              />
            </div>
          </div>
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
              body: "We measure every opening ourselves — the single most common cause of a bad window treatment is a bad measurement — and give you a written quote.",
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

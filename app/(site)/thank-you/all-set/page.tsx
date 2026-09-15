import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { PageHero } from "@/components/product/ProductParts";
import { business } from "@/content/business";
import { Confetti } from "./Confetti";

/**
 * Where the questionnaire lands after a successful save (or an empty submit).
 * Kept out of search results and the sitemap, same as /thank-you.
 */
export const metadata: Metadata = {
  title: "You're All Set | Premier Shade Solutions",
  description: "Your questionnaire is in. Here is what happens next.",
  robots: { index: false, follow: true },
};

export default function AllSetPage() {
  return (
    <>
      <Confetti />
      <PageHero
        eyebrow="You're all set"
        title="Consider it done."
        lead="Your windows just got put on the list for a serious glow-up. We'll bring the samples, the tape measure and the good ideas; you just be home."
        trail={[{ name: "Thank you", url: "/thank-you" }, { name: "All set", url: "/thank-you/all-set" }]}
      />

      <Section tone="ivory">
        <div className="flex flex-col gap-10">
          <div>
            <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
              What happens next
            </h2>
            <p className="mt-3 max-w-xl text-ink-soft">
              We&apos;ll call within one business day to find a time for your visit.
            </p>
          </div>

          <div className="border border-rule bg-sand/50 p-6">
            <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
              Need us sooner?
            </h2>
            <a
              href={business.phone.href}
              className="mt-3 block font-display text-xl text-charcoal underline-offset-4 hover:underline"
            >
              {business.phone.display}
            </a>
            <p className="mt-2 text-sm text-ink-soft">{business.hours}</p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <ButtonLink href="/">Back to home</ButtonLink>
            <Link href="/thank-you" className="text-sm text-ink-soft underline-offset-4 hover:underline">
              Change my answers
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}

import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { HeroForm } from "@/components/forms/HeroForm";
import { Breadcrumbs, type Crumb } from "@/components/product/ProductParts";
import { FeaturedReviewCard } from "@/components/booking/FeaturedReview";
import type { Photo } from "@/content/products";

/**
 * The top of a category or product page (spec 2026-10-01 §3.1). It is the page's
 * #book section, and its markup order is title, form, review, so a phone reaches
 * the form right after the title (spec 2026-09-30 §8).
 *
 * Phone: a short photo band (32/9), then the title, the booking form and the
 * featured review stacked on sand. The lead is hidden below sm and the gaps are
 * tighter, to keep the Invite Us Over button above a 390×844 fold
 * (e2e/consultation.spec.ts). Tablet (sm): a taller band (16/7) and the lead.
 * lg up: the photo fills the whole section; the title sits in an ivory panel on
 * the left, the form floats on the right, and the review card sits under the
 * title, on the photo.
 */
export function TreatmentHero({
  photo,
  trail,
  eyebrow,
  title,
  lead,
  treatment,
}: {
  photo: Photo;
  /** Omitted on the ad landing page, which links nowhere but the form. */
  trail?: Crumb[];
  eyebrow: string;
  title: string;
  lead: string;
  /** The category name, sent as the lead's treatment (see HeroForm). */
  treatment: string;
}) {
  return (
    <section id="book" className="relative scroll-mt-20 overflow-hidden bg-sand">
      <div className="relative aspect-[32/9] sm:aspect-[16/7] w-full overflow-hidden lg:absolute lg:inset-0 lg:aspect-auto">
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          priority
          sizes="100vw"
          className="animate-slow-zoom object-cover"
        />
      </div>

      <Container className="relative">
        <div className="grid gap-4 pb-6 pt-4 sm:gap-6 sm:pt-6 lg:grid-cols-12 lg:gap-8 lg:py-16">
          <div className="flex flex-col gap-3 sm:gap-4 lg:col-span-6 lg:row-start-1 lg:bg-ivory/85 lg:p-10 lg:backdrop-blur-sm">
            {trail ? <Breadcrumbs trail={trail} /> : null}
            <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
              {eyebrow}
            </p>
            <h1 className="heading-serif text-3xl leading-[1.05] text-charcoal sm:text-4xl md:text-6xl">{title}</h1>
            <p className="hidden max-w-xl text-lg leading-relaxed text-ink-soft sm:block">{lead}</p>
          </div>

          <HeroForm
            idPrefix="book"
            source="booking"
            treatment={treatment}
            className="relative z-10 lg:col-start-9 lg:col-end-13 lg:row-span-2 lg:row-start-1 lg:self-start"
          />

          <FeaturedReviewCard className="lg:col-span-6 lg:row-start-2 lg:max-w-lg" />
        </div>
      </Container>
    </section>
  );
}

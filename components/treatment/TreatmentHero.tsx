import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { HeroForm } from "@/components/forms/HeroForm";
import { Breadcrumbs, type Crumb } from "@/components/product/ProductParts";
import { FeaturedReviewCard } from "@/components/booking/FeaturedReview";
import type { Photo } from "@/content/products";

/**
 * The top of a category or product page (spec 2026-10-01 §3.1): one large photo
 * with the title on its left, the booking form floating on its right and the
 * featured review overlapping its lower edge. It is the page's #book section.
 * Markup order is title, form, review, so a phone reaches the form right after
 * the title (spec 2026-09-30 §8). Below sm the photo is a short band, the lead is
 * hidden and the gaps are tighter, to keep the Invite Us Over button above a
 * 390×844 fold (e2e/consultation.spec.ts).
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
  trail: Crumb[];
  eyebrow: string;
  title: string;
  lead: string;
  /** The category name, sent as the lead's treatment (see HeroForm). */
  treatment: string;
}) {
  return (
    <section id="book" className="relative scroll-mt-20 overflow-hidden bg-sand">
      <div className="relative aspect-[16/5] w-full overflow-hidden lg:absolute lg:inset-0 lg:aspect-auto">
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
            <Breadcrumbs trail={trail} />
            <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
              {eyebrow}
            </p>
            <h1 className="heading-serif text-4xl leading-[1.05] text-charcoal md:text-6xl">{title}</h1>
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

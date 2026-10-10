import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { HeroForm } from "@/components/forms/HeroForm";
import { HOLIDAY_LEAD_NOTE, HOLIDAY_OFFER_LINE, holidayLeadTimes } from "@/content/holiday";
import type { Photo } from "@/content/products";

/**
 * The top of /holiday, in the mood of the owner's holiday flyer: the photo, a light wash, "Holidays" set large.
 * It is the page's #book section, laid out like TreatmentHero so Invite Us Over stays above a 390×844 fold
 * (e2e/consultation.spec.ts). The offer line shows at every width; the lead-time note from sm up.
 */
export function HolidayHero({ stage, photo }: { stage: "offer" | "family"; photo: Photo }) {
  return (
    <section id="book" className="relative scroll-mt-20 overflow-hidden bg-sand">
      <div className="relative aspect-[32/9] w-full overflow-hidden sm:aspect-[16/7] lg:absolute lg:inset-0 lg:aspect-auto">
        <Image src={photo.src} alt={photo.alt} fill priority sizes="100vw" className="animate-slow-zoom object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ivory/50 via-ivory/10 to-transparent" aria-hidden="true" />
      </div>

      <Container className="relative">
        <div className="grid gap-4 pb-6 pt-4 sm:gap-6 sm:pt-6 lg:grid-cols-12 lg:gap-8 lg:py-16">
          <div className="flex flex-col gap-3 sm:gap-4 lg:col-span-6 lg:row-start-1 lg:bg-ivory/85 lg:p-10 lg:backdrop-blur-sm">
            <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
              {stage === "offer" ? "Holiday special · Las Vegas valley" : "The holidays · Las Vegas valley"}
            </p>
            {stage === "offer" ? (
              <h1 className="text-charcoal">
                <span className="block font-display text-sm font-medium uppercase tracking-[0.24em] sm:text-base">
                  Get your home ready for the
                </span>{" "}
                <span className="heading-serif block text-5xl leading-none sm:text-6xl md:text-7xl">Holidays</span>
              </h1>
            ) : (
              <h1 className="heading-serif text-3xl leading-[1.05] text-charcoal sm:text-4xl md:text-6xl">
                Give your home a fresh look before the family arrives.
              </h1>
            )}
            {stage === "offer" ? (
              <p className="font-display text-base font-medium text-charcoal sm:text-lg">{HOLIDAY_OFFER_LINE}</p>
            ) : null}
            <p className="hidden max-w-xl leading-relaxed text-ink-soft sm:block">{holidayLeadTimes(stage)}</p>
          </div>

          <HeroForm
            idPrefix="book"
            source="holiday"
            notes={stage === "offer" ? HOLIDAY_LEAD_NOTE : undefined}
            introOnPhone={false}
            className="relative z-10 lg:col-start-9 lg:col-end-13 lg:row-start-1 lg:self-start"
          />
        </div>
      </Container>
    </section>
  );
}

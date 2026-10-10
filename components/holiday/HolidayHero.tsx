import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { HeroForm } from "@/components/forms/HeroForm";
import { HOLIDAY_LEAD_NOTE, HOLIDAY_OFFER_LINE, holidayLeadTimes } from "@/content/holiday";
import { holidayOffer } from "@/content/promo";
import type { Photo } from "@/content/products";
import { Bow, Seal, Snowfall, Sparkles, StringLights } from "./Decor";
import { DaysLeft } from "./DaysLeft";

/**
 * The top of /holiday (owner 2026-10-10: "go all out"): evergreen night, string lights, snow, a script flourish and
 * "Holidays" in shimmering gold, the 10% gift tag, and the form wrapped like a present. It is the page's #book
 * section. Phone order is photo band, title, offer, form, with the eyebrow and lead-time note from sm up, so
 * Invite Us Over stays above a 390×844 fold (e2e/consultation.spec.ts).
 */
export function HolidayHero({ stage, photo }: { stage: "offer" | "family"; photo: Photo }) {
  return (
    <section id="book" className="relative isolate scroll-mt-20 overflow-hidden bg-holiday-green text-holiday-snow">
      <div className="relative aspect-[32/9] w-full overflow-hidden sm:aspect-[16/7] lg:absolute lg:inset-0 lg:aspect-auto">
        <Image src={photo.src} alt={photo.alt} fill priority sizes="100vw" className="animate-slow-zoom object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-holiday-green via-holiday-green/20 to-transparent lg:bg-gradient-to-r lg:from-holiday-green lg:via-holiday-green/80 lg:to-holiday-green/10" aria-hidden="true" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgb(243_220_148/0.25),transparent_55%)]" aria-hidden="true" />
      </div>

      <Snowfall />
      <Sparkles className="hidden lg:block" />
      <StringLights scallops={5} className="z-10" />

      <Container className="relative">
        <div className="grid gap-4 pb-8 pt-1 sm:gap-6 sm:pt-6 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-28">
          <div className="relative flex flex-col gap-1.5 sm:gap-4 lg:col-span-7 lg:row-start-1 lg:self-center">
            <p className="hidden font-display text-xs font-medium uppercase tracking-[0.28em] text-champagne sm:block">
              <span className="mr-2 inline-block rounded-full bg-holiday-red px-3 py-1 text-holiday-snow shadow-md">
                {stage === "offer" ? "Holiday special" : "The holidays"}
              </span>
              Las Vegas valley
            </p>
            {stage === "offer" ? (
              <h1 className="leading-none">
                <span className="holiday-script block text-2xl text-champagne sm:text-5xl lg:text-6xl">Get your home ready for the</span>{" "}
                <span className="holiday-display holiday-gold block pb-1 text-[3.25rem] font-black italic tracking-tight sm:pb-2 sm:text-8xl lg:text-[9rem]">
                  Holidays
                </span>
              </h1>
            ) : (
              <h1 className="holiday-display text-4xl font-black italic leading-[1.05] sm:text-6xl lg:text-7xl">
                Give your home a fresh look before the family arrives.
              </h1>
            )}
            {stage === "offer" ? (
              <p className="max-w-xl font-display text-base font-medium leading-snug text-holiday-snow sm:text-xl">{HOLIDAY_OFFER_LINE}</p>
            ) : null}
            <p className="hidden max-w-xl leading-relaxed text-holiday-snow/75 sm:block">{holidayLeadTimes(stage)}</p>
            {stage === "offer" ? (
              <>
                <DaysLeft
                  endsAt={holidayOffer.endsAt}
                  className="hidden w-fit border border-champagne/60 px-4 py-2 font-display text-xs font-medium uppercase tracking-[0.24em] text-champagne sm:inline-block"
                />
                <Seal top="10%" bottom="Off 3+" className="absolute right-0 top-16 hidden h-36 w-36 xl:block 2xl:right-10" />
              </>
            ) : null}
          </div>

          <div className="relative z-10 mt-4 lg:col-start-8 lg:col-end-13 lg:row-start-1 lg:mt-0 lg:self-center xl:col-start-9">
            <Bow className="absolute -top-5 left-1/2 z-20 w-16 -translate-x-1/2 sm:-top-9 sm:w-28 drop-shadow-[0_6px_8px_rgb(0_0_0/0.35)]" />
            <div className="bg-gradient-to-br from-[#f3dc94] via-champagne to-[#a8852f] p-1.5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)]">
              <HeroForm
                idPrefix="book"
                source="holiday"
                notes={stage === "offer" ? HOLIDAY_LEAD_NOTE : undefined}
                introOnPhone={false}
                className="!shadow-none"
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

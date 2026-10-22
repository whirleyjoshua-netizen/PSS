import Image from "next/image";
import { HeroForm } from "@/components/forms/HeroForm";
import { Container } from "@/components/ui/Container";
import { business } from "@/content/business";
import { PromiseBadges } from "@/components/booking/PromiseRow";
import { altaPhotos } from "@/content/stock-photos";
import { HOLIDAY_FORM_LINE, HOLIDAY_LEAD_NOTE } from "@/content/holiday";
import { holidayDecor, holidayOffer, solarOffer } from "@/content/promo";
import { SOLAR_FORM_LINE, SOLAR_LEAD_NOTE } from "@/content/solar-offer";
import { hasSeasonEnded, isPromoLive, seasonHideScript } from "@/lib/promo";
import { Snowflake } from "@/components/ui/Snowflake";
import { HeroSnow } from "./HeroSnow";
import { HeroGarland } from "./HeroGarland";
import { HeroOffer } from "./HeroOffer";

const HOLIDAY_DECOR = "[data-holiday-decor]";
const HOLIDAY_OFFER = "[data-holiday-offer]";

/** "Las Vegas, Henderson, Summerlin and North Las Vegas", from business.serviceArea. */
const cities = (names: readonly string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** Under the tagline: what we sell, where, and who does the work. */
export const HERO_SUBHEAD = `Custom blinds, shades, shutters and solar screens for ${cities(business.serviceArea)}. Shade’ designs, Josh measures and installs. No call center, no subcontractors.`;

function HeroFormProof() {
  return (
    <div className="mt-5 flex flex-col gap-4 border-t border-rule pt-5">
      <PromiseBadges />
    </div>
  );
}

export function Hero() {
  // Prerendered: a page built in season carries the decor and a script that takes it down when the season ends.
  const holiday = !hasSeasonEnded(holidayDecor);
  // The same for the 10% offer in the form: HeroOffer also drops its lead note once the offer ends.
  const offer = isPromoLive(holidayOffer, new Date());
  return (
    <>
      {holiday ? <script dangerouslySetInnerHTML={{ __html: seasonHideScript(holidayDecor, HOLIDAY_DECOR) }} /> : null}
      {offer ? <script dangerouslySetInnerHTML={{ __html: seasonHideScript(holidayOffer, HOLIDAY_OFFER) }} /> : null}
      <section className="relative overflow-hidden bg-charcoal text-ivory">
        <Image
          src={altaPhotos.sheerShadingsLivingRoom.src}
          alt=""
          fill
          preload
          // Decorative full-bleed art. `fill` + sizes lets next/image serve a
          // width matched to the viewport instead of the full 1800px source.
          sizes="100vw"
          aria-hidden="true"
          className="object-cover opacity-100"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-charcoal/95 via-charcoal/75 to-charcoal/30"
          aria-hidden="true"
        />
        {holiday ? <HeroSnow /> : null}

        <Container className="relative">
          <div className="grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.1fr_minmax(0,26rem)]">
            <div className="flex flex-col gap-6">
              {holiday ? (
                <p data-holiday-decor className="-mb-3 flex items-center gap-2 text-[15px] italic text-holiday-snow sm:text-lg">
                  <Snowflake className="size-4 text-champagne" />
                  Happy holidays from our family to yours
                </p>
              ) : null}
              <p className="font-display text-xs font-medium uppercase tracking-[0.24em] text-champagne">
                Family-run window treatments · Las Vegas valley
              </p>

              <h1 className="text-4xl font-light leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                {business.tagline}
              </h1>

              <p className="max-w-xl text-lg text-sand/80">
                {HERO_SUBHEAD}
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a
                  href={business.phone.href}
                  className="inline-flex min-h-11 items-center border border-ivory/40 px-6 py-3 font-display text-sm uppercase tracking-[0.14em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
                >
                  Call {business.phone.display}
                </a>
              </div>
            </div>

            {/* #book: the phone booking bar's Invite Us Over scrolls here (components/layout/MobileBookBar.tsx). */}
            <div id="book" className="scroll-mt-20">
              <HeroForm
                className="text-charcoal"
                booking
                beforeSubmit={
                  offer ? (
                    // The 15% solar offer shares the 10%'s window (content/promo.ts), so one box and one note carry both.
                    <HeroOffer
                      line={isPromoLive(solarOffer, new Date()) ? [HOLIDAY_FORM_LINE, SOLAR_FORM_LINE] : HOLIDAY_FORM_LINE}
                      note={isPromoLive(solarOffer, new Date()) ? `${HOLIDAY_LEAD_NOTE} ${SOLAR_LEAD_NOTE}` : HOLIDAY_LEAD_NOTE}
                      season={holidayOffer}
                    />
                  ) : null
                }
                footer={<HeroFormProof />}
              />
            </div>
          </div>
        </Container>
        {holiday ? <HeroGarland /> : null}
      </section>
    </>
  );
}

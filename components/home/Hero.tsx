import Image from "next/image";
import { HeroForm } from "@/components/forms/HeroForm";
import { Container } from "@/components/ui/Container";
import { business } from "@/content/business";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-charcoal text-ivory">
      <Image
        src="/gallery/transitional-shades-slider-wall.webp"
        alt=""
        fill
        priority
        // Decorative full-bleed art. `fill` + sizes lets next/image serve a
        // width matched to the viewport instead of the full 1800px source.
        sizes="100vw"
        quality={70}
        aria-hidden="true"
        className="object-cover opacity-70"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-charcoal via-charcoal/85 to-charcoal/40"
        aria-hidden="true"
      />

      <Container className="relative">
        <div className="grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.1fr_minmax(0,26rem)]">
          <div className="flex flex-col gap-6">
            <p className="font-display text-xs font-medium uppercase tracking-[0.24em] text-champagne">
              Las Vegas · Henderson · Summerlin · North Las Vegas
            </p>

            <h1 className="text-4xl font-light leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              {business.tagline}
            </h1>

            <p className="max-w-xl text-lg text-sand/80">
              Custom blinds, shades, and shutters for the valley&rsquo;s hardest
              light — measured, ordered, and installed by the two of us. Not a
              call center, not a franchise.
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

          <HeroForm className="text-charcoal" />
        </div>
      </Container>
    </section>
  );
}

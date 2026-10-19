import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Section, SectionHeading, Eyebrow } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { business } from "@/content/business";
import { categories, type CategorySlug, type Photo } from "@/content/products";
import { altaPhotos } from "@/content/stock-photos";
import { gallery } from "@/content/gallery";
import { testimonials } from "@/content/testimonials";
import { HOME_OBJECTIONS } from "@/content/consultation";
import { WARRANTY, WARRANTY_LINE } from "@/content/warranty";
import { INSURED_LINE } from "@/content/insurance";
import { cityPath } from "@/lib/content/cities";

/* ------------------------------------------------------------------ trust */

/**
 * TODO(content): the first two figures are real commitments, not claims that
 * need substantiating. Add a review count and rating here only once the Google
 * Business Profile actually has them — an invented rating is a fabricated
 * credential, and customers check.
 */
const PROMISES = [
  { figure: "Free", label: "In-home consultation and measurement" },
  { figure: "Family-run", label: "Measured and installed by us, never subcontracted" },
  // Replaced "4 Valley cities served" (owner, 2026-10-15): the service area has its own strip further down.
  { figure: "Insured", label: INSURED_LINE },
];

export function TrustBar() {
  return (
    <section className="border-b border-rule bg-sand">
      <Container>
        <dl className="grid gap-8 py-10 sm:grid-cols-3">
          {PROMISES.map((promise) => (
            <div key={promise.label} className="flex flex-col gap-1">
              <dt className="font-display text-3xl font-light text-charcoal">
                {promise.figure}
              </dt>
              <dd className="text-sm text-ink-soft">{promise.label}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------- categories */

/**
 * The homepage cards and their cover photos: Alta's catalog, never our gallery (owner, 2026-10-14). Outdoor is left
 * off (owner, 2026-10-14): Alta's library has no exterior screens, and an indoor shade would show the wrong product.
 * The header menu still links it.
 */
const COVER: Partial<Record<CategorySlug, Photo>> = {
  blinds: altaPhotos.fauxWoodLivingRoom,
  shades: altaPhotos.rollerBreakfastNook,
  shutters: altaPhotos.shuttersKitchen,
  motorization: altaPhotos.honeycombSkylights,
};

export function CategoryGrid() {
  return (
    <Section tone="ivory">
      <SectionHeading
        eyebrow="What we install"
        title="Every treatment, measured for your windows."
        lead="We carry the full range because the right answer depends on which way the window faces and what the room is for. The consultation is where we work that out."
      />

      {/* Tall cards side by side: a swipeable row on phones and tablets, all four in one row from lg up. */}
      <ul className="-mx-6 mt-12 flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {categories.map((category) => {
          const cover = COVER[category.slug];
          if (!cover) return null;
          return (
            <li key={category.slug} className="w-[70%] shrink-0 snap-start sm:w-[40%] lg:w-auto">
              <Link
                href={`/${category.slug}`}
                className="group relative flex aspect-3/4 flex-col justify-end overflow-hidden bg-charcoal"
              >
                <Image
                  src={cover.src}
                  alt={cover.alt}
                  fill
                  sizes="(min-width: 1024px) 18rem, (min-width: 640px) 40vw, 70vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/30 to-transparent"
                />
                <div className="relative flex flex-col gap-2 p-5 text-ivory">
                  <h3 className="font-display text-xl font-light tracking-tight">{category.name}</h3>
                  <p className="text-sm text-sand/85">{category.tagline}</p>
                  <span
                    aria-hidden="true"
                    className="pt-2 font-display text-xs uppercase tracking-[0.16em] text-champagne"
                  >
                    View {category.navLabel} →
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------- objections */

/**
 * The fears people have before they book, in their words, and what we do instead. The same cards as the ad landing
 * pages (content/consultation.ts), so a promise can only change in one place.
 */
export function Objections() {
  return (
    // Charcoal, between the sand reviews band and the ivory product grid.
    <Section tone="charcoal">
      <SectionHeading eyebrow="No runaround" title="What usually goes wrong, and how we do it differently." tone="dark" />

      <ul className="mt-12 grid gap-px bg-ivory/15 sm:grid-cols-2 lg:grid-cols-4">
        {HOME_OBJECTIONS.map((pain) => (
          <li key={pain.answer} className="flex flex-col gap-3 bg-charcoal p-6 md:p-8">
            <p className="text-sm italic text-sand/70">{pain.heard}</p>
            <h3 className="font-display text-xl font-light tracking-tight text-ivory">{pain.answer}</h3>
            <p className="text-sm leading-relaxed text-sand/75">{pain.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-sand/75">
        <span>{WARRANTY_LINE}</span> <span className="text-xs">{WARRANTY.fineprint}</span>
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------ why premier */

const PILLARS = [
  {
    title: "We come to you, at no charge.",
    body: "Fabric and finish look completely different in your own light than they do on a showroom wall or a screen. We bring the samples to your windows, measure every opening ourselves, and send you a written quote.",
  },
  {
    title: "From your first call to the final install, we're family.",
    body: "We are a family business, and we never hand you off to a third party for install. There is no salesperson working a commission target.",
  },
  {
    title: "Specified for this climate",
    body: "West-facing glass in this valley destroys the wrong product. We steer you toward what survives here — composite over wood in direct sun, the right screen openness for the exposure — even when it is the less expensive option.",
  },
];

export function WhyPremier() {
  return (
    <Section tone="charcoal">
      <SectionHeading
        eyebrow="Working with us"
        title="What it’s like to work with us"
        tone="dark"
      />

      <div className="mt-12 grid gap-10 md:grid-cols-3">
        {PILLARS.map((pillar, index) => (
          <div key={pillar.title} className="flex flex-col gap-3">
            <span
              aria-hidden="true"
              className="font-display text-sm text-champagne"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="font-display text-xl font-light tracking-tight text-ivory">
              {pillar.title}
            </h3>
            <p className="text-sm leading-relaxed text-sand/75">{pillar.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- gallery */

export function GalleryStrip() {
  if (gallery.length === 0) return null;

  return (
    <Section tone="ivory">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading eyebrow="Our work" title="Installed by the two of us." />
        <ButtonLink href="/gallery" variant="outline">
          View the gallery
        </ButtonLink>
      </div>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {gallery.slice(0, 6).map((item) => (
          <li key={item.src} className="relative aspect-4/3 overflow-hidden bg-sand">
            <Image
              src={item.src}
              alt={item.alt}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------------------------------------------------------- testimonials */

export function Testimonials() {
  if (testimonials.length === 0) return null;

  return (
    <Section tone="sand">
      <SectionHeading eyebrow="What customers say" title="From homes around the valley" />
      <ul className="mt-12 grid gap-8 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <li key={testimonial.name} className="flex flex-col gap-4 bg-ivory p-8">
            <blockquote className="text-sm leading-relaxed text-charcoal">
              &ldquo;{testimonial.quote}&rdquo;
            </blockquote>
            <p className="mt-auto font-display text-xs uppercase tracking-[0.16em] text-ink-soft">
              {testimonial.name} · {testimonial.city}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------------------------------------------------------------- family */

export function FamilySection() {
  return (
    // Sand: it sits between the charcoal Why Premier band and the ivory gallery.
    <Section tone="sand">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        {/* Owner 2026-10-01: the three of them here; the children are never named. */}
        <div className="relative mx-auto aspect-4/3 w-full overflow-hidden bg-sand">
          <Image
            src="/brand/owners-family.webp"
            alt="Josh and Shade’ standing outside in the sun with their young daughter held between them"
            fill
            sizes="(min-width: 1024px) 36rem, 100vw"
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-5">
          <Eyebrow>Who you&rsquo;ll be working with</Eyebrow>
          <h2 className="text-3xl font-light tracking-tight text-charcoal md:text-4xl">
            When you invite us in, you&rsquo;re inviting in family.
          </h2>
          <p className="text-ink-soft">
            We&rsquo;re a family-run business here in the Las Vegas valley. When we
            walk through your door, we&rsquo;re not thinking about the sale.
            We&rsquo;re thinking about how we&rsquo;d want someone to treat our own
            home. We&rsquo;ll listen, bring the samples, measure everything
            ourselves and stay with you from consultation to installation.
          </p>
          <div className="pt-2">
            <ButtonLink href="/about" variant="outline">
              Meet the family
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------- service area */

/** A slim strip, not a full section (owner, 2026-10-14: the big block was unnecessary). */
export function ServiceAreaBlock() {
  return (
    <section className="border-y border-rule bg-sand text-charcoal">
      <Container>
        <div className="flex flex-col gap-3 py-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <h2 className="font-display text-lg font-light tracking-tight">Serving the Las Vegas valley.</h2>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {business.serviceArea.map((city) => (
              <li key={city}>
                <Link
                  href={cityPath(city)}
                  className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                >
                  {city}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">
            We also travel to {business.travelArea.join(" and ")}. Not listed?{" "}
            <a href={business.phone.href} className="inline-flex min-h-11 items-center text-charcoal underline underline-offset-4">
              Call {business.phone.display}
            </a>
          </p>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------ closing cta */

export function ClosingCta() {
  return (
    <Section tone="charcoal">
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-xl text-3xl font-light tracking-tight text-ivory md:text-4xl">
            Invite us over.
          </h2>
          <p className="max-w-xl text-sand/75">
            We&rsquo;ll bring the samples. You bring the coffee.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            <ButtonLink href="/contact">Invite Us Over</ButtonLink>
            <a
              href={business.phone.href}
              className="inline-flex min-h-11 items-center whitespace-nowrap border border-ivory/40 px-6 py-3 font-display text-sm uppercase tracking-[0.14em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
            >
              {business.phone.display}
            </a>
          </div>
          <p className="text-sm text-sand/75">Free in-home consultation. No charge, no obligation.</p>
        </div>
      </div>
    </Section>
  );
}

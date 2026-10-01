import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Section, SectionHeading, Eyebrow } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { consultationPhoto, gallery } from "@/content/gallery";
import { testimonials } from "@/content/testimonials";
import { getProductsIn } from "@/lib/content/products";
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
  { figure: "4", label: "Valley cities served" },
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

export function CategoryGrid() {
  return (
    <Section tone="ivory">
      <SectionHeading
        eyebrow="What we install"
        title="Every treatment, measured for your windows"
        lead="We carry the full range because the right answer depends on which way the window faces and what the room is for. The consultation is where we work that out."
      />

      <ul className="mt-12 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const children = getProductsIn(category.slug);
          return (
            <li key={category.slug} className="bg-ivory">
              <Link
                href={`/${category.slug}`}
                className="flex h-full flex-col gap-3 p-8 transition-colors hover:bg-sand/50"
              >
                <h3 className="font-display text-xl font-light tracking-tight text-charcoal">
                  {category.name}
                </h3>
                <p className="text-sm text-ink-soft">{category.tagline}</p>
                {children.length > 0 ? (
                  <p className="mt-auto pt-4 text-xs text-ink-soft">
                    {children.map((child) => child.name).join(" · ")}
                  </p>
                ) : null}
                <span
                  aria-hidden="true"
                  className="mt-auto pt-4 font-display text-xs uppercase tracking-[0.16em] text-champagne-ink"
                >
                  View {category.name} →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------ why premier */

const PILLARS = [
  {
    title: "We come to you, at no charge",
    body: "Fabric and finish look completely different in your own light than they do on a showroom wall or a screen. We bring the samples to your windows, measure every opening ourselves, and quote before we leave.",
  },
  {
    title: "We do the work ourselves",
    body: "The same two people who measure your windows are the ones who install them. Nothing is handed to a subcontractor who has never spoken to you, and there is no salesperson working a commission target.",
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
        <SectionHeading eyebrow="Our work" title="Installed by the two of us" />
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
    <Section tone="ivory">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="relative mx-auto aspect-4/3 w-full overflow-hidden bg-sand">
          <Image
            src={consultationPhoto.src}
            alt={consultationPhoto.alt}
            fill
            sizes="(min-width: 1024px) 36rem, 100vw"
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-5">
          <Eyebrow>Who you&rsquo;ll be working with</Eyebrow>
          <h2 className="text-3xl font-light tracking-tight text-charcoal md:text-4xl">
            When you invite us in, you&rsquo;re inviting in family
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

export function ServiceAreaBlock() {
  return (
    <Section tone="sand">
      <SectionHeading
        eyebrow="Where we work"
        title="Serving the Las Vegas valley"
        lead="If you are inside the valley and not listed here, call anyway — we will tell you honestly whether we can get to you."
      />

      <ul className="mt-10 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {business.serviceArea.map((city) => (
          <li key={city} className="bg-sand">
            <Link
              href={cityPath(city)}
              className="block p-6 transition-colors hover:bg-ivory"
            >
              <span className="font-display text-lg font-light text-charcoal">
                {city}
              </span>
              <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-ink-soft">
                Nevada
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------ closing cta */

export function ClosingCta() {
  return (
    <Section tone="charcoal">
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-xl text-3xl font-light tracking-tight text-ivory md:text-4xl">
            Invite us over
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

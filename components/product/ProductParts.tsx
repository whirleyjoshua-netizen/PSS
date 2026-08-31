import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { business } from "@/content/business";
import type { Product } from "@/content/products";

export type Crumb = { name: string; url: string };

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] text-taupe">
        <li>
          <Link href="/" className="transition-colors hover:text-champagne-ink">
            Home
          </Link>
        </li>
        {trail.map((crumb, index) => (
          <li key={crumb.url} className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            {index === trail.length - 1 ? (
              <span aria-current="page" className="text-ink-soft">
                {crumb.name}
              </span>
            ) : (
              <Link href={crumb.url} className="transition-colors hover:text-champagne-ink">
                {crumb.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHero({
  eyebrow,
  title,
  lead,
  trail,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  trail: Crumb[];
}) {
  return (
    <div className="border-b border-rule bg-sand">
      <Container>
        <div className="flex flex-col gap-6 py-12 md:py-16">
          <Breadcrumbs trail={trail} />
          {eyebrow ? (
            <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="max-w-3xl text-4xl font-light leading-tight tracking-tight text-charcoal md:text-5xl">
            {title}
          </h1>
          {lead ? <p className="max-w-2xl text-lg text-ink-soft">{lead}</p> : null}
        </div>
      </Container>
    </div>
  );
}

export function ProductCardList({
  products,
  categorySlug,
}: {
  products: Product[];
  categorySlug: string;
}) {
  return (
    <ul className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <li key={product.slug} className="bg-ivory">
          <Link
            href={`/${categorySlug}/${product.slug}`}
            className="flex h-full flex-col gap-3 p-8 transition-colors hover:bg-sand/50"
          >
            <h3 className="font-display text-xl font-light tracking-tight text-charcoal">
              {product.name}
            </h3>
            <p className="text-sm text-ink-soft">{product.tagline}</p>
            <p className="text-sm leading-relaxed text-taupe">{product.bestFor}</p>
            <span
              aria-hidden="true"
              className="mt-auto pt-4 font-display text-xs uppercase tracking-[0.16em] text-champagne-ink"
            >
              Learn more →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ConsultationCta({
  title = "Not sure which is right for your windows?",
  body = "That is exactly what the free in-home consultation is for. We look at the exposure, the room, and what you actually need it to do — then tell you honestly.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Section tone="charcoal">
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-xl text-2xl font-light tracking-tight text-ivory md:text-3xl">
            {title}
          </h2>
          <p className="max-w-xl text-sand/75">{body}</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <ButtonLink href="/contact">Book a consultation</ButtonLink>
          <a
            href={business.phone.href}
            className="inline-flex min-h-11 items-center whitespace-nowrap border border-ivory/40 px-6 py-3 font-display text-sm uppercase tracking-[0.14em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
          >
            {business.phone.display}
          </a>
        </div>
      </div>
    </Section>
  );
}

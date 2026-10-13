import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { BookingBlock } from "@/components/booking/BookingBlock";
import { JsonLd } from "@/components/seo/JsonLd";
import { consultationPhoto } from "@/content/gallery";
import { LEAD_TIME_LINE } from "@/content/consultation";
import { WARRANTY_LINE } from "@/content/warranty";
import { breadcrumbSchema } from "@/lib/seo/schema";
import type { ServiceCity } from "@/content/business";
import { allCityPaths, getCity } from "@/lib/content/cities";
import { pageMetadata } from "@/lib/seo/metadata";

export const dynamicParams = false;

export async function generateStaticParams() {
  return allCityPaths();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const found = getCity(city);
  if (!found) return {};

  return pageMetadata({
    ...found.seo,
    path: `/service-area/${found.slug}`,
    // The page's only photo, in its booking block.
    photo: consultationPhoto,
  });
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const found = getCity(city);
  if (!found) notFound();

  const path = `/service-area/${found.slug}`;

  return (
    <>
      {/* There is no service-area index page, so the structured trail is Home > City. */}
      <JsonLd schema={breadcrumbSchema([{ name: found.name, url: path }])} />
      <PageHero
        eyebrow="Service area"
        title={`Window treatments in ${found.name}, NV.`}
        trail={[
          { name: "Service Area", url: `/service-area/${found.slug}` },
          { name: found.name, url: `/service-area/${found.slug}` },
        ]}
      />

      <Section tone="ivory">
        {/* Columns are sized to their content and left-aligned so the body
            starts on the same edge as the page heading above it. A 1fr first
            column would stretch and leave a hole beside the capped prose
            measure; centering would break alignment with the hero. */}
        <div className="grid gap-12 lg:grid-cols-[minmax(0,72ch)_22rem] lg:gap-16">
          <div className="flex flex-col gap-5 text-lg leading-relaxed text-ink-soft">
            {found.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          <aside className="flex flex-col gap-8">
            <div className="border border-rule bg-sand/50 p-6">
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                What we see in {found.name}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-charcoal">
                {found.climateNote}
              </p>
            </div>

            <div>
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                Areas we serve
              </h2>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-soft">
                {found.neighborhoods.map((neighborhood) => (
                  <li key={neighborhood}>{neighborhood}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="sand">
        <h2 className="text-3xl font-light tracking-tight text-charcoal">
          What we install most in {found.name}.
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {found.popularProducts.map((product) => (
            <li key={product.href} className="flex flex-col gap-2 border border-rule bg-ivory p-6">
              <Link
                href={product.href}
                className="font-display text-sm font-medium uppercase tracking-[0.14em] text-charcoal underline-offset-4 hover:underline"
              >
                {product.name}
              </Link>
              <p className="text-sm leading-relaxed text-ink-soft">{product.why}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="ivory">
        <h2 className="text-3xl font-light tracking-tight text-charcoal">
          How a {found.name} project works.
        </h2>
        <div className="mt-6 flex max-w-[72ch] flex-col gap-4 text-lg leading-relaxed text-ink-soft">
          <p>
            We bring samples to your home in {found.name}, so you see every color and fabric in your own
            light. Josh measures every window himself, backed by our measurement guarantee: if a
            measurement is off, we remake it and install it again, free.
          </p>
          <p>
            Your written quote gives your lead time ({LEAD_TIME_LINE}), and we put up temporary
            shades for free while you wait. On install day we protect your floors, clean up before we
            go, and haul your old blinds away for free. {WARRANTY_LINE}
          </p>
        </div>
      </Section>

      <BookingBlock
        photo={consultationPhoto}
        city={found.name as ServiceCity}
        heading={`Book a free consultation in ${found.name}.`}
        line={found.opening}
      />

      <ConsultationCta
        title={`Serving ${found.name} and the rest of the valley.`}
        body="If you are nearby but not listed, call anyway — we will tell you honestly whether we can get to you."
        href="#book"
      />
    </>
  );
}

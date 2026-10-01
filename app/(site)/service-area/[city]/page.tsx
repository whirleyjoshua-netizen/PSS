import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { BookingBlock } from "@/components/booking/BookingBlock";
import { consultationPhoto } from "@/content/gallery";
import type { ServiceCity } from "@/content/business";
import { allCityPaths, getCity } from "@/lib/content/cities";

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

  return {
    title: found.seo.title,
    description: found.seo.description,
    alternates: { canonical: `/service-area/${found.slug}` },
    openGraph: {
      title: found.seo.title,
      description: found.seo.description,
      url: `/service-area/${found.slug}`,
      type: "website",
    },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const found = getCity(city);
  if (!found) notFound();

  return (
    <>
      <PageHero
        eyebrow="Service area"
        title={`Window Treatments in ${found.name}, NV`}
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
        <h2 className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
          Popular in {found.name}
        </h2>
        <ul className="mt-8 flex flex-wrap gap-3">
          {found.popularProducts.map((product) => (
            <li key={product.href}>
              <Link
                href={product.href}
                className="inline-flex min-h-11 items-center border border-rule bg-ivory px-5 py-2.5 text-sm text-charcoal transition-colors hover:border-champagne-ink"
              >
                {product.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <BookingBlock
        photo={consultationPhoto}
        city={found.name as ServiceCity}
        heading={`Book a free consultation in ${found.name}`}
      />

      <ConsultationCta
        title={`Serving ${found.name} and the rest of the valley`}
        body="If you are nearby but not listed, call anyway — we will tell you honestly whether we can get to you."
        href="#book"
      />
    </>
  );
}

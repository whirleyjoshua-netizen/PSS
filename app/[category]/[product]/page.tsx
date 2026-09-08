import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { PageHero, ConsultationCta } from "@/components/product/ProductParts";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, productSchema } from "@/lib/seo/schema";
import {
  allProductPaths,
  getCategory,
  getProduct,
  getSiblings,
} from "@/lib/content/products";

export const dynamicParams = false;

export async function generateStaticParams() {
  return allProductPaths();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; product: string }>;
}): Promise<Metadata> {
  const { category, product } = await params;
  const found = getProduct(category, product);
  if (!found) return {};

  return {
    title: found.seo.title,
    description: found.seo.description,
    alternates: { canonical: `/${category}/${product}` },
    openGraph: {
      title: found.seo.title,
      description: found.seo.description,
      url: `/${category}/${product}`,
      type: "website",
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ category: string; product: string }>;
}) {
  const { category, product } = await params;
  const found = getProduct(category, product);
  const parent = getCategory(category);
  if (!found || !parent) notFound();

  const siblings = getSiblings(found);
  const trail = [
    { name: parent.name, url: `/${parent.slug}` },
    { name: found.name, url: `/${parent.slug}/${found.slug}` },
  ];

  return (
    <>
      <JsonLd schema={productSchema(found)} />
      <JsonLd schema={breadcrumbSchema(trail)} />
      <PageHero
        eyebrow={found.tagline}
        title={`${found.name} in Las Vegas`}
        trail={trail}
      />

      <Section tone="ivory">
        {/* Columns are sized to their content and left-aligned so the body
            starts on the same edge as the page heading above it. A 1fr first
            column would stretch and leave a hole beside the capped prose
            measure; centering would break alignment with the hero. */}
        <div className="grid gap-12 lg:grid-cols-[minmax(0,72ch)_22rem] lg:gap-16">
          <div className="flex flex-col gap-5 text-lg leading-relaxed text-ink-soft">
            {found.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          <aside className="flex flex-col gap-8">
            <div className="border border-rule bg-sand/50 p-6">
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                Best for
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-charcoal">{found.bestFor}</p>
            </div>

            <div>
              <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
                Details
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {found.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-champagne" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </Section>

      {siblings.length > 0 ? (
        <Section tone="sand">
          <h2 className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
            Other {parent.name}
          </h2>
          <ul className="mt-8 flex flex-wrap gap-3">
            {siblings.map((sibling) => (
              <li key={sibling.slug}>
                <Link
                  href={`/${parent.slug}/${sibling.slug}`}
                  className="inline-flex min-h-11 items-center border border-rule bg-ivory px-5 py-2.5 text-sm text-charcoal transition-colors hover:border-champagne-ink"
                >
                  {sibling.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <ConsultationCta
        title={`Thinking about ${found.name.toLowerCase()}?`}
        body="We bring samples to your windows, measure every opening, and quote before we leave. No charge and no obligation."
      />
    </>
  );
}

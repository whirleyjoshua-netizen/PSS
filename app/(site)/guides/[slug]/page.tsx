import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/product/ProductParts";
import { Section } from "@/components/ui/Section";
import { JsonLd } from "@/components/seo/JsonLd";
import { GuideCta } from "@/components/guides/GuideCta";
import { StepCard } from "@/components/guides/StepCard";
import { breadcrumbSchema, articleSchema } from "@/lib/seo/schema";
import { categories } from "@/content/products";
import { guideBySlug, guides, minutesLabel, updatedLabel } from "@/content/guides";

/** An unknown slug is a real 404 rather than a rendered page. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return {};

  return {
    title: guide.seo.title,
    description: guide.seo.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.seo.title,
      description: guide.seo.description,
      url: `/guides/${guide.slug}`,
      type: "article",
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const trail = [
    { name: "Guides", url: "/guides" },
    { name: guide.crumb, url: `/guides/${guide.slug}` },
  ];
  const category = categories.find((c) => c.slug === guide.category)!;
  const related = guide.related.map((s) => guideBySlug(s)!);

  return (
    <>
      <JsonLd schema={breadcrumbSchema(trail)} />
      <JsonLd schema={articleSchema(guide)} />
      <PageHero eyebrow={`${category.name} · Repair guide`} title={guide.title} trail={trail} />

      <Section tone="ivory" padding="tight-top">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
          <article className="max-w-3xl pt-6">
            <p className="flex flex-wrap gap-x-4 gap-y-1 font-display text-sm text-ink-soft">
              <span className="font-medium text-charcoal">{minutesLabel(guide.minutes)}</span>
              <span>{guide.tools}</span>
              <span>Updated {updatedLabel(guide)}</span>
              <span>Written by our installers</span>
            </p>

            <div className="mt-6 border-l-4 border-champagne bg-white px-5 py-4">
              <p className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">Quick answer</p>
              <p className="mt-1 leading-relaxed text-charcoal">{guide.quickAnswer}</p>
            </div>

            <h2 className="mt-12 text-2xl font-light text-charcoal">Step by step</h2>
            <ol aria-label="Steps" className="mt-4 grid gap-4 md:grid-cols-2">
              {guide.steps.map((step, index) => (
                <StepCard key={step.title} step={step} index={index} />
              ))}
            </ol>

            <h2 className="mt-12 text-2xl font-light text-charcoal">Why it happens</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{guide.why}</p>

            <GuideCta slug={guide.slug} variant="inline" cta={guide.cta} />

            <h2 className="text-2xl font-light text-charcoal">Common questions</h2>
            <div className="mt-3">
              {guide.faq.map(({ q, a }, index) => (
                <details key={q} open={index === 0} className="border-t border-rule py-4">
                  <summary className="cursor-pointer font-display font-medium text-charcoal">{q}</summary>
                  <p className="mt-2 leading-relaxed text-ink-soft">{a}</p>
                </details>
              ))}
            </div>

            {related.length > 0 ? (
              <>
                <h2 className="mt-12 text-2xl font-light text-charcoal">Other guides</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {related.map((other) => (
                    <li key={other.slug}>
                      <Link href={`/guides/${other.slug}`} className="block border border-rule bg-white px-4 py-3 font-display text-charcoal transition-colors hover:border-champagne">
                        {other.title} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <GuideCta slug={guide.slug} variant="aside" />
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}

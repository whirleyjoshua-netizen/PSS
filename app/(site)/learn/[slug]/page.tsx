import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/product/ProductParts";
import { Section } from "@/components/ui/Section";
import { JsonLd } from "@/components/seo/JsonLd";
import { BookingBlock } from "@/components/booking/BookingBlock";
import { articlePageSchema, breadcrumbSchema } from "@/lib/seo/schema";
import { consultationPhoto } from "@/content/gallery";
import { articleBySlug, articles } from "@/content/articles";

/** An unknown slug is a real 404 rather than a rendered page. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) return {};
  const url = `/learn/${article.slug}`;
  return {
    title: article.seo.title,
    description: article.seo.description,
    alternates: { canonical: url },
    // No `images`: ./opengraph-image.tsx supplies the site image, which Next adds only while this is unset.
    openGraph: { title: article.seo.title, description: article.seo.description, url, type: "article" },
    twitter: { card: "summary_large_image" },
  };
}

const updatedLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });

/** A buying guide (content/articles.ts): a quick answer, the sections, the products it is about, then the form. */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();

  const path = `/learn/${article.slug}`;
  // Like the repair guides, these sit under Questions & care (/faq); there is no /learn index.
  const trail = [
    { name: "Questions & care", url: "/faq" },
    { name: article.crumb, url: path },
  ];

  return (
    <>
      <JsonLd schema={breadcrumbSchema(trail)} />
      <JsonLd schema={articlePageSchema({ path, title: article.title, description: article.seo.description, published: article.published, updated: article.updated })} />
      <PageHero eyebrow="Buying guide" title={article.title} trail={trail} />

      <Section tone="ivory" containerWidth="prose" padding="tight-top">
        <article className="pt-6">
          <p className="font-display text-sm text-ink-soft">
            Updated {updatedLabel(article.updated)} · Written by the family who measures and installs them
          </p>
          <div className="mt-6 border-l-4 border-champagne bg-white px-5 py-4">
            <p className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">Quick answer</p>
            <p className="mt-1 leading-relaxed text-charcoal">{article.quickAnswer}</p>
          </div>

          {article.sections.map((section) => (
            <section key={section.heading} className="mt-12">
              <h2 className="text-2xl font-light text-charcoal">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-3 leading-relaxed text-ink-soft">{paragraph}</p>
              ))}
              {section.photo ? (
                <figure className="mt-6">
                  <div className="relative aspect-3/2 w-full overflow-hidden bg-sand">
                    <Image src={section.photo.src} alt={section.photo.alt} fill sizes="(min-width: 768px) 42rem, 100vw" className="object-cover" />
                  </div>
                  {section.photo.caption ? (
                    <figcaption className="mt-2 text-sm text-ink-soft">{section.photo.caption}</figcaption>
                  ) : null}
                </figure>
              ) : null}
            </section>
          ))}

          <h2 className="mt-12 text-2xl font-light text-charcoal">The products in this guide</h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {article.products.map((product) => (
              <li key={product.href}>
                <Link href={product.href} className="block border border-rule bg-white px-4 py-3 font-display text-charcoal transition-colors hover:border-champagne">
                  {product.name} →
                </Link>
              </li>
            ))}
          </ul>
        </article>
      </Section>

      <BookingBlock photo={consultationPhoto} heading="See the options at your own windows." />
    </>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/Section";
import {
  PageHero,
  ProductCardList,
  ConsultationCta,
} from "@/components/product/ProductParts";
import { BookingBlock } from "@/components/booking/BookingBlock";
import { JsonLd } from "@/components/seo/JsonLd";
import { consultationPhoto } from "@/content/gallery";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { categories } from "@/content/products";
import { getCategory, getProductsIn } from "@/lib/content/products";

/** An unknown slug is a real 404 rather than a rendered page. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return categories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const found = getCategory(category);
  if (!found) return {};

  return {
    title: found.seo.title,
    description: found.seo.description,
    alternates: { canonical: `/${found.slug}` },
    openGraph: {
      title: found.seo.title,
      description: found.seo.description,
      url: `/${found.slug}`,
      type: "website",
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const found = getCategory(category);
  if (!found) notFound();

  const children = getProductsIn(found.slug);

  const trail = [{ name: found.name, url: `/${found.slug}` }];

  return (
    <>
      <JsonLd schema={breadcrumbSchema(trail)} />
      <PageHero
        eyebrow={found.tagline}
        title={`${found.name} in Las Vegas`}
        trail={trail}
      />
      <BookingBlock photo={consultationPhoto} treatment={found.name} />

      <Section tone="ivory">
        <div
          className={
            found.image ? "grid items-center gap-12 lg:grid-cols-2" : undefined
          }
        >
          <div className="flex max-w-[72ch] flex-col gap-5 text-lg leading-relaxed text-ink-soft">
            {found.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          {found.image ? (
            <div className="relative mx-auto aspect-3/4 w-full max-w-md overflow-hidden bg-sand">
              <Image
                src={found.image.src}
                alt={found.image.alt}
                fill
                sizes="(min-width: 1024px) 28rem, 100vw"
                className="object-cover"
              />
            </div>
          ) : null}
        </div>

        {children.length > 0 ? (
          <div className="mt-14">
            <h2 className="mb-8 font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
              Explore {found.name}
            </h2>
            <ProductCardList products={children} categorySlug={found.slug} />
          </div>
        ) : null}
      </Section>

      <ConsultationCta href="#book" />
    </>
  );
}

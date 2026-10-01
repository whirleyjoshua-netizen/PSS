import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsultationCta } from "@/components/product/ProductParts";
import { TreatmentHero } from "@/components/treatment/TreatmentHero";
import { PromiseRow } from "@/components/booking/PromiseRow";
import { spotlightReviewsExceptFeatured } from "@/components/booking/FeaturedReview";
import { IconRow } from "@/components/treatment/IconRow";
import { StorySection } from "@/components/treatment/StorySection";
import { PhotoCardGrid } from "@/components/treatment/PhotoCardGrid";
import { Section } from "@/components/ui/Section";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { uniquePhotos } from "@/lib/content/page-photos";
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

  const [heroPhoto, storyPhoto, ...cardPhotos] = uniquePhotos([
    found.heroVideo?.poster ?? found.bookingPhoto ?? consultationPhoto,
    found.image,
    ...children.map((product) => product.image),
  ]);

  return (
    <>
      <JsonLd schema={breadcrumbSchema(trail)} />
      <TreatmentHero
        photo={heroPhoto!}
        video={found.heroVideo?.src}
        trail={trail}
        eyebrow={found.tagline}
        title={`${found.name} in Las Vegas`}
        lead={found.seo.description}
        treatment={found.name}
      />
      <Section tone="sand" className="!py-10">
        <PromiseRow centered />
      </Section>
      <IconRow items={found.highlights} />
      <StorySection
        eyebrow={found.story.eyebrow}
        heading={found.story.heading}
        paragraphs={found.intro}
        photo={storyPhoto}
        panelLabel={found.name}
        caption={found.story.caption}
      />
      {children.length > 0 ? (
        <PhotoCardGrid
          flush
          heading={`Explore ${found.name}`}
          cards={children.map((product, index) => ({
            href: `/${found.slug}/${product.slug}`,
            name: product.name,
            tagline: product.tagline,
            photo: cardPhotos[index],
          }))}
        />
      ) : null}
      <ReviewSpotlight reviews={spotlightReviewsExceptFeatured} />
      <ConsultationCta href="#book" />
    </>
  );
}

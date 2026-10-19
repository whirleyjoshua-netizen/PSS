import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsultationCta } from "@/components/product/ProductParts";
import { TreatmentHero } from "@/components/treatment/TreatmentHero";
import { PromiseRow } from "@/components/booking/PromiseRow";
import { spotlightReviewsExceptFeatured } from "@/components/booking/FeaturedReview";
import { IconRow } from "@/components/treatment/IconRow";
import { StorySection } from "@/components/treatment/StorySection";
import { PhotoCardGrid } from "@/components/treatment/PhotoCardGrid";
import { DetailsBand } from "@/components/treatment/DetailsBand";
import { Section } from "@/components/ui/Section";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { uniquePhotos } from "@/lib/content/page-photos";
import { JsonLd } from "@/components/seo/JsonLd";
import { consultationPhoto } from "@/content/gallery";
import { breadcrumbSchema, serviceSchema } from "@/lib/seo/schema";
import { pageMetadata } from "@/lib/seo/metadata";
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

  return pageMetadata({
    ...found.seo,
    path: `/${category}/${product}`,
    // The hero photo: the same choice the page makes below.
    photo: found.image ?? consultationPhoto,
  });
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

  const [heroPhoto, storyPhoto, ...cardPhotos] = uniquePhotos([
    found.image ?? consultationPhoto,
    found.storyPhoto,
    ...siblings.map((sibling) => sibling.image),
  ]);

  return (
    <>
      <JsonLd schema={serviceSchema(found)} />
      <JsonLd schema={breadcrumbSchema(trail)} />
      <TreatmentHero
        photo={heroPhoto!}
        trail={trail}
        eyebrow={found.tagline}
        title={`${found.name} in Las Vegas`}
        lead={found.seo.description}
        treatment={parent.name}
      />
      <Section tone="sand" className="!py-10">
        <PromiseRow centered line={found.opening} />
      </Section>
      <IconRow items={parent.highlights} />
      <StorySection
        eyebrow={parent.name}
        heading={`Why ${found.name}`}
        paragraphs={found.body}
        photo={storyPhoto}
        panelLabel={found.name}
        caption={{ eyebrow: "Best for", line: found.bestFor }}
      />
      <DetailsBand features={found.features} warranty={parent.slug !== "outdoor"} />
      {siblings.length > 0 ? (
        <PhotoCardGrid
          heading={`Other ${parent.name}`}
          cards={siblings.map((sibling, index) => ({
            href: `/${parent.slug}/${sibling.slug}`,
            name: sibling.name,
            tagline: sibling.tagline,
            photo: cardPhotos[index],
          }))}
        />
      ) : null}
      <ReviewSpotlight reviews={spotlightReviewsExceptFeatured} />
      <ConsultationCta
        title={`Thinking about ${found.name.toLowerCase()}?`}
        body="We bring samples to your windows, measure every opening, and send you a written quote. No charge and no obligation."
        href="#book"
      />
    </>
  );
}

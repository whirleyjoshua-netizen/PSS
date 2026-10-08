import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConsultationLanding } from "@/components/consultation/ConsultationLanding";
import { consultationPhoto } from "@/content/gallery";
import { LANDING_VARIANTS, landingTitle } from "@/content/consultation";
import { getCategory } from "@/lib/content/products";
import type { CategorySlug } from "@/content/products";

/** One landing page per ad group: /consultation/shutters, /consultation/motorization… */
export const dynamicParams = false;

export async function generateStaticParams() {
  return Object.keys(LANDING_VARIANTS).map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const variant = LANDING_VARIANTS[category as CategorySlug];
  if (!variant) return {};
  return {
    title: `${landingTitle(variant.noun)} | Premier Shade Solutions`,
    description: `${variant.noun} for your Las Vegas home, measured by the owner and guaranteed. Free in-home consultation.`,
    robots: { index: false, follow: true },
  };
}

export default async function CategoryConsultationPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const variant = LANDING_VARIANTS[category as CategorySlug];
  const found = getCategory(category);
  if (!variant || !found) notFound();

  return (
    <ConsultationLanding
      photo={found.bookingPhoto ?? found.image ?? consultationPhoto}
      noun={variant.noun}
      treatment={found.name}
    />
  );
}

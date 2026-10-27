import type { Metadata } from "next";
import { business } from "@/content/business";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/site";
import { Hero } from "@/components/home/Hero";
import {
  TrustBar,
  Objections,
  CategoryGrid,
  WhyPremier,
  GalleryStrip,
  Testimonials,
  ClosingCta,
} from "@/components/home/Sections";
import { PastWorkReviews } from "@/components/reviews/PastWorkReviews";

/**
 * Title and description come from the root layout. The openGraph is the page's own, so it carries its url and
 * title; no `images`, so the share image comes from ./opengraph-image.tsx in this same segment.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    type: "website",
    siteName: business.name,
    locale: "en_US",
  },
};

/**
 * Products first, then the experience, then our work, then trust (owner, 2026-10-13: products and gallery above
 * the reviews). The family section lives on /about only (owner, 2026-10-27).
 */
export default function Home() {
  return (
    <>
      <Hero />
      <TrustBar />
      <CategoryGrid />
      <WhyPremier />
      <GalleryStrip />
      <Testimonials />
      <PastWorkReviews />
      <Objections />
      <ClosingCta />
    </>
  );
}

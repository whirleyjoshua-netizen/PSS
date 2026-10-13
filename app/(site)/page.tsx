import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import {
  TrustBar,
  Objections,
  CategoryGrid,
  WhyPremier,
  GalleryStrip,
  Testimonials,
  FamilySection,
  ServiceAreaBlock,
  ClosingCta,
} from "@/components/home/Sections";
import { PastWorkReviews } from "@/components/reviews/PastWorkReviews";

/** Title and description come from the root layout; only the canonical is the page's own. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** People, then the experience, then trust, then products (family brand spec §3). */
export default function Home() {
  return (
    <>
      <Hero />
      <TrustBar />
      <FamilySection />
      <WhyPremier />
      <Testimonials />
      <PastWorkReviews />
      <Objections />
      <CategoryGrid />
      <GalleryStrip />
      <ServiceAreaBlock />
      <ClosingCta />
    </>
  );
}

import { Hero } from "@/components/home/Hero";
import {
  TrustBar,
  CategoryGrid,
  WhyPremier,
  GalleryStrip,
  Testimonials,
  FamilySection,
  ServiceAreaBlock,
  ClosingCta,
} from "@/components/home/Sections";
import { PastWorkReviews } from "@/components/reviews/PastWorkReviews";

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
      <CategoryGrid />
      <GalleryStrip />
      <ServiceAreaBlock />
      <ClosingCta />
    </>
  );
}

import { Hero } from "@/components/home/Hero";
import {
  TrustBar,
  CategoryGrid,
  WhyPremier,
  GalleryStrip,
  Testimonials,
  MeetTheOwners,
  ServiceAreaBlock,
  ClosingCta,
} from "@/components/home/Sections";
import { PastWorkReviews } from "@/components/reviews/PastWorkReviews";

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
      <MeetTheOwners />
      <ServiceAreaBlock />
      <ClosingCta />
    </>
  );
}

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/product/ProductParts";
import { BookingBlock } from "@/components/booking/BookingBlock";
import { consultationPhoto } from "@/content/gallery";
import { ReviewWall } from "@/components/reviews/ReviewWall";
import { pastReviews } from "@/content/reviews";

export const metadata: Metadata = pageMetadata({
  title: "Client Reviews | Premier Shade Solutions",
  description:
    "What clients said about Josh's installations and design consultations with Shade’, from our years before Premier Shade Solutions.",
  path: "/reviews",
  photo: consultationPhoto,
});

export default function ReviewsPage() {
  return (
    <>
      <PageHero
        eyebrow="Client reviews"
        title="What clients said about our work"
        lead={`These surveys come from our years installing and designing in Ohio and here in Las Vegas, before we opened Premier Shade Solutions. They are about the two of us, the owners of this family business.`}
        trail={[{ name: "Reviews", url: "/reviews" }]}
      />

      <Section tone="ivory">
        <ReviewWall reviews={pastReviews} />
      </Section>

      <BookingBlock photo={consultationPhoto} showReview={false} />
    </>
  );
}

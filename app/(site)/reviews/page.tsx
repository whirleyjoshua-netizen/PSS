import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/product/ProductParts";
import { BookingBlock } from "@/components/booking/BookingBlock";
import { consultationPhoto } from "@/content/gallery";
import { ReviewWall } from "@/components/reviews/ReviewWall";
import { pastReviews, pastWork } from "@/content/reviews";

export const metadata: Metadata = {
  title: "Client Reviews | Premier Shade Solutions",
  description:
    "What clients said about Josh's installations and Shade's design consultations — surveys from our years with Custom Decorators, before Premier Shade Solutions.",
  alternates: { canonical: "/reviews" },
};

export default function ReviewsPage() {
  return (
    <>
      <PageHero
        eyebrow="Client reviews"
        title="What clients said about our work"
        lead={`These surveys come from our years installing and designing for ${pastWork.source}, in Ohio and here in Las Vegas, before we opened Premier Shade Solutions. They are about the two of us — the same two people who will measure and install your windows.`}
        trail={[{ name: "Reviews", url: "/reviews" }]}
      />

      <Section tone="ivory">
        <ReviewWall reviews={pastReviews} />
      </Section>

      <BookingBlock photo={consultationPhoto} />
    </>
  );
}

import type { Metadata } from "next";
import { ConsultationLanding } from "@/components/consultation/ConsultationLanding";
import { consultationPhoto } from "@/content/gallery";

/**
 * The general ad landing page, for the broad Window Treatments ad group. Kept out of
 * search results and the sitemap: it repeats the product pages, and it exists so ad
 * clicks can be measured on their own (spec 2026-10-08).
 */
export const metadata: Metadata = {
  title: "Free In-Home Consultation | Premier Shade Solutions",
  description:
    "Beautiful window treatments for your Las Vegas home, measured by the owner and guaranteed. Free in-home consultation.",
  robots: { index: false, follow: true },
};

export default function ConsultationPage() {
  return <ConsultationLanding photo={consultationPhoto} />;
}

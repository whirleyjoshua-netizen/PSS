import type { FaqGroup } from "@/content/faq";

/**
 * FAQPage JSON-LD, built from content/faq.ts so the markup can never say something the page doesn't.
 *
 * Google limits FAQ rich results to a few authoritative government and health sites (since 2023), so this
 * will not earn a rich result here. It is published for clarity: it hands search engines and AI answer
 * engines each question paired with its plain-text answer.
 *
 * Built here rather than in lib/seo/schema.ts, which another branch is changing at the same time; move it
 * there once both have landed.
 */
export function faqPageSchema(groups: FaqGroup[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    ),
  };
}

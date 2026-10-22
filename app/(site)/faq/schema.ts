import type { FaqGroup } from "@/content/faq";
import { faqSchema } from "@/lib/seo/schema";

/** FAQPage JSON-LD for every question on /faq, built from content/faq.ts so the markup can never say something the page doesn't. */
export const faqPageSchema = (groups: FaqGroup[]) => faqSchema(groups.flatMap((group) => group.items));

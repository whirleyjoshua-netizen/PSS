import type { MetadataRoute } from "next";
import { business } from "@/content/business";
import { categories, products } from "@/content/products";
import { cities } from "@/content/cities";
import { guides } from "@/content/guides";

/**
 * Derived entirely from the content model, so a product added to
 * content/products.ts appears here automatically. Nothing is listed by hand.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${business.domain}${path}`;
  const lastModified = new Date("2026-08-31");
  // The index changes when a guide does, so it carries the newest guide's date.
  const guidesModified = new Date(guides.map((guide) => guide.updated).sort().at(-1)!);

  return [
    { url: business.domain, priority: 1.0, changeFrequency: "monthly", lastModified },

    ...categories.map((category) => ({
      url: url(`/${category.slug}`),
      priority: 0.9,
      changeFrequency: "monthly" as const,
      lastModified,
    })),

    ...products.map((product) => ({
      url: url(`/${product.category}/${product.slug}`),
      priority: 0.8,
      changeFrequency: "monthly" as const,
      lastModified,
    })),

    ...cities.map((city) => ({
      url: url(`/service-area/${city.slug}`),
      priority: 0.8,
      changeFrequency: "monthly" as const,
      lastModified,
    })),

    { url: url("/guides"), priority: 0.6, changeFrequency: "monthly" as const, lastModified: guidesModified },

    ...guides.map((guide) => ({
      url: url(`/guides/${guide.slug}`),
      priority: 0.6,
      changeFrequency: "monthly" as const,
      lastModified: new Date(guide.updated),
    })),

    { url: url("/contact"), priority: 0.9, changeFrequency: "yearly", lastModified },
    { url: url("/about"), priority: 0.7, changeFrequency: "yearly", lastModified },
    { url: url("/gallery"), priority: 0.7, changeFrequency: "monthly", lastModified },
    { url: url("/reviews"), priority: 0.7, changeFrequency: "monthly", lastModified },
    { url: url("/privacy"), priority: 0.3, changeFrequency: "yearly", lastModified },
    { url: url("/accessibility"), priority: 0.3, changeFrequency: "yearly", lastModified },
  ];
}

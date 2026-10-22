import type { MetadataRoute } from "next";
import { business } from "@/content/business";
import { categories, products } from "@/content/products";
import { cities } from "@/content/cities";
import { guides } from "@/content/guides";
import { articles } from "@/content/articles";

/**
 * Derived entirely from the content model, so a product added to
 * content/products.ts appears here automatically. Nothing is listed by hand.
 *
 * lastModified is sent only where the content model records when a page last
 * changed: each guide's `updated`. Every other page leaves it out, the FAQ
 * included: its answers are built from other files (content/faq.ts), so a date
 * typed into it would go stale when any of them changed. A fixed date (it was
 * "2026-08-31" for every page) goes stale the moment copy changes, and the build time would claim every page changed
 * on every deploy. Google ignores lastmod across a site once it proves
 * inaccurate, which would also cost the real dates their weight.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${business.domain}${path}`;

  return [
    { url: business.domain, priority: 1.0, changeFrequency: "monthly" },

    ...categories.map((category) => ({
      url: url(`/${category.slug}`),
      priority: 0.9,
      changeFrequency: "monthly" as const,
    })),

    ...products.map((product) => ({
      url: url(`/${product.category}/${product.slug}`),
      priority: 0.8,
      changeFrequency: "monthly" as const,
    })),

    ...cities.map((city) => ({
      url: url(`/service-area/${city.slug}`),
      priority: 0.8,
      changeFrequency: "monthly" as const,
    })),

    // The guides index is gone: /guides redirects to the FAQ's Care and repair section (next.config.ts).
    ...guides.map((guide) => ({
      url: url(`/guides/${guide.slug}`),
      priority: 0.6,
      changeFrequency: "monthly" as const,
      lastModified: new Date(guide.updated),
    })),

    // Buying guides; there is no /learn index, so they hang off /faq like the repair guides.
    ...articles.map((article) => ({
      url: url(`/learn/${article.slug}`),
      priority: 0.7,
      changeFrequency: "monthly" as const,
      lastModified: new Date(article.updated),
    })),

    { url: url("/faq"), priority: 0.8, changeFrequency: "monthly" },
    { url: url("/contact"), priority: 0.9, changeFrequency: "yearly" },
    { url: url("/about"), priority: 0.7, changeFrequency: "yearly" },
    { url: url("/gallery"), priority: 0.7, changeFrequency: "monthly" },
    { url: url("/reviews"), priority: 0.7, changeFrequency: "monthly" },
    { url: url("/privacy"), priority: 0.3, changeFrequency: "yearly" },
    { url: url("/accessibility"), priority: 0.3, changeFrequency: "yearly" },
  ];
}

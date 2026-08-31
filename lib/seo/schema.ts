import { business } from "@/content/business";
import type { Product } from "@/content/products";

const absolute = (path: string): string =>
  path.startsWith("http") ? path : `${business.domain}${path}`;

type LocalBusinessSchema = {
  "@context": string;
  "@type": string;
  name: string;
  description: string;
  url: string;
  telephone?: string;
  email?: string;
  address?: Record<string, string>;
  areaServed: { "@type": string; name: string }[];
  priceRange: string;
  slogan: string;
};

/**
 * HomeAndConstructionBusiness is a LocalBusiness subtype and fits this trade
 * better than the generic type.
 *
 * The postal address is omitted entirely while it is a placeholder. Publishing
 * a wrong address in structured data can attach the business to a location it
 * has never operated from, which is harder to undo than simply not claiming
 * one yet.
 */
export function localBusinessSchema(): LocalBusinessSchema {
  const schema: LocalBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: business.name,
    description:
      "Custom blinds, shades, shutters, and motorized window treatments for the Las Vegas valley, measured and installed by the owners.",
    url: business.domain,
    areaServed: business.serviceArea.map((city) => ({
      "@type": "City",
      name: `${city}, NV`,
    })),
    priceRange: business.priceRange,
    slogan: business.tagline,
  };

  if (!business.phone.isPlaceholder) {
    schema.telephone = business.phone.display;
  }
  if (!business.emailIsPlaceholder) {
    schema.email = business.email;
  }
  if (!business.address.isPlaceholder) {
    schema.address = {
      "@type": "PostalAddress",
      addressLocality: business.address.locality,
      addressRegion: business.address.region,
      addressCountry: business.address.country,
    };
  }

  return schema;
}

export function productSchema(product: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.seo.description,
    category: product.category,
    brand: { "@type": "Brand", name: business.name },
    url: absolute(`/${product.category}/${product.slug}`),
  };
}

export function breadcrumbSchema(trail: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: business.domain },
      ...trail.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name: crumb.name,
        item: absolute(crumb.url),
      })),
    ],
  };
}

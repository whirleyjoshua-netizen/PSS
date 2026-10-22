import { business, leadCities } from "@/content/business";
import type { Product } from "@/content/products";
import type { Guide } from "@/content/guides";

const absolute = (path: string): string =>
  path.startsWith("http") ? path : `${business.domain}${path}`;

/** One stable id for the business, so every Service on the site can point at it as its provider. */
export const BUSINESS_ID = `${business.domain}/#business`;

type LocalBusinessSchema = {
  "@context": string;
  "@type": string;
  "@id": string;
  name: string;
  logo: string;
  image: string;
  description: string;
  url: string;
  telephone?: string;
  email?: string;
  address?: Record<string, string>;
  areaServed: { "@type": string; name: string }[];
  priceRange: string;
  slogan: string;
  sameAs?: string[];
};

/**
 * HomeAndConstructionBusiness is a LocalBusiness subtype and fits this trade
 * better than the generic type.
 *
 * The street address is omitted while it is a placeholder. Publishing a wrong
 * address in structured data can attach the business to a location it has never
 * operated from, which is harder to undo than simply not claiming one yet. The
 * city, state and country are true either way, so they are always published.
 *
 * No openingHoursSpecification: the business works by appointment
 * (business.hours), so there are no opening hours to claim. No AggregateRating
 * or Review either: our reviews pre-date this business (content/reviews.ts).
 */
export function localBusinessSchema(): LocalBusinessSchema {
  const schema: LocalBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": BUSINESS_ID,
    name: business.name,
    logo: absolute("/brand/lockup-light.png"),
    image: absolute("/brand/owners-family.webp"),
    description:
      "Custom blinds, shades, shutters, and motorized window treatments for the Las Vegas valley, measured and installed by the owners.",
    url: business.domain,
    areaServed: leadCities.map((city) => ({
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
  const profiles = Object.values(business.socials);
  if (profiles.length > 0) {
    schema.sameAs = profiles;
  }
  schema.address = {
    "@type": "PostalAddress",
    addressLocality: business.address.locality,
    addressRegion: business.address.region,
    addressCountry: business.address.country,
  };

  return schema;
}

/**
 * A product page describes a service we sell and install, not a retail Product:
 * Product markup without offers or reviews is flagged in Search Console, and we
 * publish neither prices nor (pre-business) reviews.
 */
export function serviceSchema(product: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: product.name,
    serviceType: product.name,
    description: product.seo.description,
    provider: { "@id": BUSINESS_ID },
    areaServed: leadCities.map((city) => ({
      "@type": "City",
      name: `${city}, NV`,
    })),
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

/**
 * FAQPage JSON-LD for questions shown on the page (the /faq page and the product, category and city pages' own
 * questions, components/faq/PageFaq.tsx). Google limits FAQ rich results to a few government and health sites (since
 * 2023), so this earns no rich result; it hands search engines and AI answer engines each question with its answer.
 */
export function faqSchema(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/**
 * A category page (blinds, shades, shutters, outdoor, motorization) is a service we sell and install, like a
 * product page (serviceSchema).
 */
export function categoryServiceSchema(category: { slug: string; name: string; seo: { description: string } }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: category.name,
    serviceType: category.name,
    description: category.seo.description,
    provider: { "@id": BUSINESS_ID },
    areaServed: leadCities.map((city) => ({
      "@type": "City",
      name: `${city}, NV`,
    })),
    url: absolute(`/${category.slug}`),
  };
}

/**
 * A repair guide is an Article written by the business. No HowTo or FAQPage
 * markup: Google stopped showing either for ordinary sites in 2023.
 */
export function articleSchema(guide: Guide) {
  const url = absolute(`/guides/${guide.slug}`);
  const organization = { "@type": "Organization", name: business.name, url: business.domain };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.seo.description,
    url,
    mainEntityOfPage: url,
    datePublished: guide.published,
    dateModified: guide.updated,
    author: organization,
    publisher: organization,
  };
}

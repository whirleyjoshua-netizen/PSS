import type { Metadata } from "next";
import { business } from "@/content/business";
import type { Photo } from "@/content/products";

/**
 * Metadata for a page that sets its own Open Graph fields. Next.js replaces the
 * whole inherited `openGraph` object when a page defines one, which silently
 * dropped the share image (and the site name) from every category, product and
 * city page. Every such page goes through here so the image, site name, locale
 * and large Twitter card always come along.
 */
export function pageMetadata({
  title,
  description,
  path,
  photo,
}: {
  title: string;
  description: string;
  /** Site-relative, e.g. "/shades/solar-shades"; resolved against metadataBase. */
  path: string;
  /** The page's own hero photo, a static file under public/. */
  photo: Photo;
}): Metadata {
  const image = { url: photo.src, alt: photo.alt };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: business.name,
      locale: "en_US",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

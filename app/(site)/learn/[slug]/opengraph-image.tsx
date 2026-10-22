import SiteImage from "../../opengraph-image";

/**
 * The site's share image, re-served from this segment. This page sets its own openGraph (for its url and
 * type), and a page-level openGraph replaces the layout's whole object, so the (site) image is dropped.
 * Next only fills it back in from an opengraph-image file in the page's own segment.
 *
 * alt, size and contentType are literals, not re-exports: Next reads them from this module.
 */
export const alt = "Premier Shade Solutions — You let us into your home. We let you into our family.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return SiteImage();
}

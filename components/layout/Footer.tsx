import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/Container";
import { business } from "@/content/business";
import { INSURED_FOOTER } from "@/content/insurance";
import { categories } from "@/content/products";
import { cityPath } from "@/lib/content/cities";

/**
 * Column labels, not headings: the footer repeats on every page, and three h2s
 * there made each page's outline end in "Products / Service Area / Get in Touch".
 * Same styling as the old h2s, so nothing moves visually. Each column is a nav
 * named by its visible label (aria-labelledby), so a screen reader announces the
 * same group name a sighted visitor reads.
 */
const LABEL = "font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-charcoal text-ivory">
      <Container>
        <div className="grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-5">
            <Logo variant="lockup" tone="dark" className="text-[26px]" />
            <p className="max-w-xs text-sm text-sand/70">{business.tagline}</p>
            <p className="max-w-xs text-sm text-sand/70">
              Custom window treatments for the Las Vegas valley, measured and
              installed by the owners.
            </p>
            <p className="max-w-xs text-sm text-sand/70">{INSURED_FOOTER}</p>
          </div>

          <nav aria-labelledby="footer-products" className="flex flex-col gap-4">
            <p id="footer-products" className={LABEL}>Products</p>
            <ul className="flex flex-col gap-2 text-sm">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/${category.slug}`}
                    className="text-sand/80 transition-colors hover:text-ivory"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/faq" className="text-sand/80 transition-colors hover:text-ivory">
                  Questions &amp; care
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="footer-service-area" className="flex flex-col gap-4">
            <p id="footer-service-area" className={LABEL}>Service Area</p>
            <ul className="flex flex-col gap-2 text-sm">
              {business.serviceArea.map((city) => (
                <li key={city}>
                  <Link
                    href={cityPath(city)}
                    className="text-sand/80 transition-colors hover:text-ivory"
                  >
                    {city}, NV
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-get-in-touch" className="flex flex-col gap-4">
            <p id="footer-get-in-touch" className={LABEL}>Get in Touch</p>
            <ul className="flex flex-col gap-2 text-sm text-sand/80">
              <li>
                <Link href="/about" className="transition-colors hover:text-ivory">
                  Our family
                </Link>
              </li>
              <li>
                <Link href="/reviews" className="transition-colors hover:text-ivory">
                  Reviews
                </Link>
              </li>
              <li>
                <a href={business.phone.href} className="transition-colors hover:text-ivory">
                  {business.phone.display}
                </a>
              </li>
              <li>
                <a href={`mailto:${business.email}`} className="break-all transition-colors hover:text-ivory">
                  {business.email}
                </a>
              </li>
              <li>{business.hours}</li>
            </ul>
            <Link
              href="/contact"
              className="mt-2 inline-flex min-h-11 w-fit items-center bg-champagne px-5 py-2.5 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-ivory"
            >
              Invite Us Over
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-4 border-t border-ivory/15 py-8 text-xs text-sand/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {business.legalName}. All rights reserved.
          </p>
          <ul className="flex gap-6">
            <li>
              <Link href="/privacy" className="transition-colors hover:text-ivory">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/accessibility" className="transition-colors hover:text-ivory">
                Accessibility
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}

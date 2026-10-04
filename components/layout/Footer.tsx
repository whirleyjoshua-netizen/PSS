import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/Container";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { cityPath } from "@/lib/content/cities";

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
          </div>

          <nav aria-label="Products" className="flex flex-col gap-4">
            <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne">
              Products
            </h2>
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
                <Link href="/guides" className="text-sand/80 transition-colors hover:text-ivory">
                  Repair &amp; care guides
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Service area" className="flex flex-col gap-4">
            <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne">
              Service Area
            </h2>
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

          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne">
              Get in Touch
            </h2>
            <ul className="flex flex-col gap-2 text-sm text-sand/80">
              <li>
                <a href={business.phone.href} className="transition-colors hover:text-ivory">
                  {business.phone.display}
                </a>
              </li>
              <li>
                <a href={`mailto:${business.email}`} className="transition-colors hover:text-ivory">
                  {business.email}
                </a>
              </li>
              <li>{business.hours}</li>
            </ul>
            <Link
              href="/contact"
              className="mt-2 inline-flex min-h-11 w-fit items-center bg-champagne px-5 py-2.5 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-ivory"
            >
              Free Consultation
            </Link>
          </div>
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

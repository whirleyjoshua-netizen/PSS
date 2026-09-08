import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/Container";
import { MobileMenu } from "./MobileMenu";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { getProductsIn } from "@/lib/content/products";

/**
 * Sticky header — a server component.
 *
 * Two deliberate choices keep this shipping almost no JavaScript:
 *
 * 1. Submenus are always in the DOM and revealed with CSS on hover and
 *    focus-within, never conditionally rendered. That keeps all sixteen
 *    product links crawlable and reachable by keyboard.
 * 2. Only the mobile menu is a client component. Making the whole header
 *    client-side meant hydrating seventy-odd links on every page load, which
 *    dominated total blocking time.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-ivory/95 backdrop-blur">
      <Container>
        <div className="flex items-center justify-between gap-6 py-4">
          {/* No aria-label here: the Logo's own role="img" names this link. An
              aria-label that does not contain the link's visible text is a
              label/name mismatch for voice-control users. */}
          <Link href="/" className="shrink-0">
            <Logo variant="lockup" className="text-[26px] md:text-[30px]" />
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {categories.map((category) => {
                const children = getProductsIn(category.slug);
                return (
                  <li key={category.slug} className="group relative">
                    <Link
                      href={`/${category.slug}`}
                      className="block whitespace-nowrap px-3 py-2 font-display text-sm uppercase tracking-[0.12em] text-charcoal transition-colors hover:text-champagne-ink"
                    >
                      {category.navLabel}
                    </Link>

                    {children.length > 0 ? (
                      <div className="invisible absolute left-0 top-full z-10 w-64 border border-rule bg-ivory py-2 opacity-0 shadow-lg transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                        <ul>
                          {children.map((product) => (
                            <li key={product.slug}>
                              <Link
                                href={`/${category.slug}/${product.slug}`}
                                className="block px-4 py-2 text-sm text-ink-soft transition-colors hover:bg-sand hover:text-charcoal"
                              >
                                {product.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={business.phone.href}
              className="whitespace-nowrap font-display text-sm uppercase tracking-[0.12em] text-charcoal transition-colors hover:text-champagne-ink"
            >
              Call {business.phone.display}
            </a>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center whitespace-nowrap bg-champagne px-5 py-2.5 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
            >
              Free Consultation
            </Link>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <a
              href={business.phone.href}
              aria-label={`Call ${business.name}`}
              className="inline-flex size-11 items-center justify-center text-charcoal md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                />
              </svg>
            </a>
            <MobileMenu />
          </div>
        </div>
      </Container>
    </header>
  );
}

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/Container";
import { MobileMenu } from "./MobileMenu";
import { NavDisclosure } from "./NavDisclosure";
import { ABOUT_LINKS } from "./nav-links";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { getProductsIn } from "@/lib/content/products";

/**
 * Sticky header — a server component.
 *
 * Two deliberate choices keep this shipping little JavaScript:
 *
 * 1. Submenus are always in the HTML, never conditionally rendered, so all
 *    sixteen product links stay crawlable. Each dropdown is a small client
 *    disclosure (NavDisclosure): a button with aria-expanded and a panel that
 *    is hidden while closed, opened by hover, click, Enter or Space.
 * 2. Only the toggles are client components; the links inside them are
 *    server-rendered children. Making the whole header client-side meant
 *    hydrating seventy-odd links on every page load, which dominated total
 *    blocking time.
 *
 * Six top-level items plus Call and the CTA must fit at 1024px (measured: they
 * overflowed by ~150px), so between lg and xl the logo is smaller, gaps and
 * tracking are tighter and the phone link shows just the number. Tighten
 * spacing before dropping an item.
 */
const TOP_LINK =
  "block whitespace-nowrap px-1.5 py-2 font-display text-sm uppercase tracking-[0.06em] text-charcoal transition-colors hover:text-champagne-ink xl:px-3 xl:tracking-[0.12em]";
/** A dropdown's label: a button styled exactly like a top-level link, so the row's width does not change. */
const TOP_BUTTON = `${TOP_LINK} cursor-pointer aria-expanded:text-champagne-ink`;
const PANEL_ITEM = "block px-4 py-2 text-sm transition-colors hover:bg-sand hover:text-charcoal";
const PANEL_LINK = `${PANEL_ITEM} text-ink-soft`;

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-ivory/95 backdrop-blur">
      <Container>
        <div className="flex items-center justify-between gap-6 py-4 lg:gap-3 xl:gap-6">
          {/* No aria-label here: the Logo's own role="img" names this link. An
              aria-label that does not contain the link's visible text is a
              label/name mismatch for voice-control users. */}
          <Link href="/" className="shrink-0">
            <Logo variant="lockup" className="text-[26px] md:text-[30px] lg:text-[22px] xl:text-[30px]" />
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center xl:gap-1">
              {categories.map((category) => {
                const children = getProductsIn(category.slug);
                if (children.length === 0) {
                  return (
                    <li key={category.slug}>
                      <Link href={`/${category.slug}`} className={TOP_LINK}>
                        {category.navLabel}
                      </Link>
                    </li>
                  );
                }
                return (
                  <NavDisclosure key={category.slug} label={category.navLabel} className={TOP_BUTTON} panelClassName="left-0 w-64">
                    <ul aria-label={category.name}>
                      {/* The label is the toggle, so the category's own page is the panel's first link. */}
                      <li>
                        <Link href={`/${category.slug}`} className={`${PANEL_ITEM} font-medium text-charcoal`}>
                          All {category.name.toLowerCase()}
                        </Link>
                      </li>
                      {children.map((product) => (
                        <li key={product.slug}>
                          <Link href={`/${category.slug}/${product.slug}`} className={PANEL_LINK}>
                            {product.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </NavDisclosure>
                );
              })}

              {/* Right-aligned: it is the last item, so a left-aligned panel would run off narrow screens. The
                  label is the toggle and "Our family" (/about) the panel's first link, so About never sits beside
                  a second link to the same page. */}
              <NavDisclosure label="About" className={TOP_BUTTON} panelClassName="right-0 w-48">
                <ul aria-label="About">
                  {ABOUT_LINKS.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={PANEL_LINK}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </NavDisclosure>
            </ul>
          </nav>

          <div className="hidden items-center gap-3 md:flex lg:gap-2 xl:gap-3">
            <a
              href={business.phone.href}
              className="whitespace-nowrap font-display text-sm uppercase tracking-[0.12em] text-charcoal transition-colors hover:text-champagne-ink"
            >
              {/* "Call" is visually dropped only between lg and xl, where the full row is tightest; the link keeps it in its name. */}
              <span className="lg:max-xl:sr-only">Call </span>
              {business.phone.display}
            </a>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center whitespace-nowrap bg-champagne px-5 py-2.5 lg:max-xl:px-4 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
            >
              Invite Us Over
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

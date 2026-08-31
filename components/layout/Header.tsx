"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/ui/Container";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { getProductsIn } from "@/lib/content/products";

/**
 * Sticky header.
 *
 * Submenus are always present in the DOM and revealed with CSS on hover and
 * focus-within, never conditionally rendered. That keeps all sixteen product
 * links crawlable and reachable by keyboard — a JS-gated menu would hide the
 * entire product catalogue from search engines.
 */
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-50 bg-ivory/95 backdrop-blur transition-shadow ${
        scrolled ? "border-b border-rule shadow-sm" : "border-b border-transparent"
      }`}
    >
      <Container>
        <div className="flex items-center justify-between gap-6 py-4">
          <Link href="/" className="shrink-0" aria-label={`${business.name} home`}>
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
                      className="block px-3 py-2 font-display text-sm uppercase tracking-[0.12em] text-charcoal transition-colors hover:text-champagne-ink"
                    >
                      {category.name}
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
              className="font-display text-sm uppercase tracking-[0.12em] text-charcoal transition-colors hover:text-champagne-ink"
            >
              Call {business.phone.display}
            </a>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center bg-champagne px-5 py-2.5 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
            >
              Free Consultation
            </Link>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <a
              href={business.phone.href}
              aria-label={`Call ${business.name}`}
              className="inline-flex size-11 items-center justify-center text-charcoal"
            >
              <PhoneIcon />
            </a>
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex size-11 items-center justify-center text-charcoal"
            >
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
              <MenuIcon open={menuOpen} />
            </button>
          </div>
        </div>
      </Container>

      <div
        id="mobile-menu"
        hidden={!menuOpen}
        className="max-h-[calc(100dvh-5rem)] overflow-y-auto border-t border-rule bg-ivory md:hidden"
      >
        <Container>
          <nav aria-label="Mobile" className="py-6">
            <ul className="flex flex-col gap-6">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/${category.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className="font-display text-lg uppercase tracking-[0.12em] text-charcoal"
                  >
                    {category.name}
                  </Link>
                  {getProductsIn(category.slug).length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1 border-l border-rule pl-4">
                      {getProductsIn(category.slug).map((product) => (
                        <li key={product.slug}>
                          <Link
                            href={`/${category.slug}/${product.slug}`}
                            onClick={() => setMenuOpen(false)}
                            className="block py-1 text-ink-soft"
                          >
                            {product.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
              <li className="pt-2">
                <Link
                  href="/gallery"
                  onClick={() => setMenuOpen(false)}
                  className="font-display text-lg uppercase tracking-[0.12em] text-charcoal"
                >
                  Gallery
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  onClick={() => setMenuOpen(false)}
                  className="font-display text-lg uppercase tracking-[0.12em] text-charcoal"
                >
                  About
                </Link>
              </li>
              <li className="pt-2">
                <Link
                  href="/contact"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-h-11 w-full items-center justify-center bg-champagne px-5 py-3 font-display text-sm font-medium uppercase tracking-[0.14em] text-charcoal"
                >
                  Free Consultation
                </Link>
              </li>
            </ul>
          </nav>
        </Container>
      </div>
    </header>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
      />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
      )}
    </svg>
  );
}

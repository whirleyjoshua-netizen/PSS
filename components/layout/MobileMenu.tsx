"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { categories } from "@/content/products";
import { getProductsIn } from "@/lib/content/products";

/**
 * The only interactive part of the header, and therefore the only part that
 * ships JavaScript. The desktop nav is server-rendered with CSS-driven
 * dropdowns — making the whole header a client component meant hydrating
 * seventy-odd links on every page for the sake of one toggle.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 items-center justify-center text-charcoal lg:hidden"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
            />
          )}
        </svg>
      </button>

      {/* Rendered only while open. The same links are already in the
          server-rendered desktop nav, so crawlers and screen readers lose
          nothing — but every visitor was paying to hydrate ~70 duplicate
          links they would never see. */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto border-t border-rule bg-ivory lg:hidden"
      >
        {open ? (
        <Container>
          <nav aria-label="Mobile" className="py-6">
            <ul className="flex flex-col gap-6">
              {categories.map((category) => {
                const children = getProductsIn(category.slug);
                return (
                  <li key={category.slug}>
                    <Link
                      href={`/${category.slug}`}
                      onClick={close}
                      className="font-display text-lg uppercase tracking-[0.12em] text-charcoal"
                    >
                      {category.name}
                    </Link>
                    {children.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1 border-l border-rule pl-4">
                        {children.map((product) => (
                          <li key={product.slug}>
                            <Link
                              href={`/${category.slug}/${product.slug}`}
                              onClick={close}
                              className="block py-1 text-ink-soft"
                            >
                              {product.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}

              <li className="pt-2">
                <Link
                  href="/gallery"
                  onClick={close}
                  className="font-display text-lg uppercase tracking-[0.12em] text-charcoal"
                >
                  Gallery
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  onClick={close}
                  className="font-display text-lg uppercase tracking-[0.12em] text-charcoal"
                >
                  About
                </Link>
              </li>
              <li className="pt-2">
                <Link
                  href="/contact"
                  onClick={close}
                  className="inline-flex min-h-11 w-full items-center justify-center bg-champagne px-5 py-3 font-display text-sm font-medium uppercase tracking-[0.14em] text-charcoal"
                >
                  Free Consultation
                </Link>
              </li>
            </ul>
          </nav>
        </Container>
        ) : null}
      </div>
    </>
  );
}

import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { FabricPanel } from "./FabricPanel";
import type { Photo } from "@/content/products";

export type PhotoCard = { href: string; name: string; tagline: string; photo?: Photo };

/** "Explore {Category}" / "Other {Category}": a photo (or the fabric panel) above each product's name. */
export function PhotoCardGrid({ heading, cards, flush = false }: { heading: string; cards: PhotoCard[]; flush?: boolean }) {
  return (
    <Section tone="ivory" className={flush ? "!pt-0" : undefined}>
      <h2 className="mb-8 font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">
        {heading}
      </h2>
      <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.href}>
            <Link href={card.href} className="group flex h-full flex-col gap-4">
              {card.photo ? (
                <div className="relative aspect-4/3 w-full overflow-hidden bg-sand">
                  <Image
                    src={card.photo.src}
                    alt={card.photo.alt}
                    fill
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
              ) : (
                <FabricPanel label={card.name} className="aspect-4/3 w-full" />
              )}
              <h3 className="heading-serif text-2xl text-charcoal">{card.name}</h3>
              <p className="text-sm leading-relaxed text-ink-soft">{card.tagline}</p>
              <span aria-hidden="true" className="mt-auto font-display text-xs uppercase tracking-[0.16em] text-champagne-ink">
                Learn more →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

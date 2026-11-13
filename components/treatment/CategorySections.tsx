import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import type { CategorySection } from "@/content/products";

/**
 * A category hub's longer copy under the product cards (content pipeline 2026-11-11, /blinds): a heading, a few
 * paragraphs, the pages it points to and, at most, one of our own install photos with its gallery caption. The page
 * sets `showPhoto` false when that photo already appeared higher up, so no page repeats a photo.
 */
export function CategorySections({ sections }: { sections: (CategorySection & { showPhoto: boolean })[] }) {
  if (sections.length === 0) return null;
  return (
    <Section tone="ivory" containerWidth="prose" className="!pt-0">
      {sections.map((section) => (
        <section key={section.heading} className="mt-12 first:mt-0">
          <h2 className="text-2xl font-light text-charcoal">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="mt-3 leading-relaxed text-ink-soft">{paragraph}</p>
          ))}
          {section.photo && section.showPhoto ? (
            <figure className="mt-6">
              <div className="relative aspect-3/2 w-full overflow-hidden bg-sand">
                <Image src={section.photo.src} alt={section.photo.alt} fill sizes="(min-width: 768px) 42rem, 100vw" className="object-cover" />
              </div>
              {section.photo.caption ? (
                <figcaption className="mt-2 text-sm text-ink-soft">{section.photo.caption}</figcaption>
              ) : null}
            </figure>
          ) : null}
          {section.links && section.links.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-display text-sm text-charcoal underline underline-offset-4 hover:text-champagne-ink">
                    {link.name} →
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </Section>
  );
}

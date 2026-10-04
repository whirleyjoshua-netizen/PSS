import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/product/ProductParts";
import { Section } from "@/components/ui/Section";
import { categories } from "@/content/products";
import { guides, minutesLabel } from "@/content/guides";

export const metadata: Metadata = {
  title: "Blind & Shade Repair Guides | Premier Shade Solutions",
  description:
    "Step-by-step fixes for blinds and shades, with diagrams, from the installers who put them up across the Las Vegas valley.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndexPage() {
  const groups = categories
    .map((category) => ({ category, items: guides.filter((g) => g.category === category.slug) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <PageHero
        title="Repair & care guides"
        lead="Step-by-step fixes for blinds and shades, with diagrams, from the installers who put them up across the Las Vegas valley."
        trail={[{ name: "Guides", url: "/guides" }]}
      />
      <Section tone="ivory">
        <div className="flex flex-col gap-12">
          {groups.map(({ category, items }) => (
            <section key={category.slug}>
              <h2 className="text-2xl font-light text-charcoal">{category.name}</h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {items.map((guide) => (
                  <li key={guide.slug}>
                    <Link href={`/guides/${guide.slug}`} className="flex h-full flex-col gap-2 border border-rule bg-white p-5 transition-colors hover:border-champagne">
                      <span className="font-display text-lg text-charcoal">{guide.title}</span>
                      <span className="line-clamp-3 text-ink-soft">{guide.quickAnswer}</span>
                      <span className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">{minutesLabel(guide.minutes)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Section>
    </>
  );
}

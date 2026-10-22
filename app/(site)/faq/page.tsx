import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/product/ProductParts";
import { Section } from "@/components/ui/Section";
import { JsonLd } from "@/components/seo/JsonLd";
import { BookingBlock } from "@/components/booking/BookingBlock";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { consultationPhoto } from "@/content/gallery";
import { FAQ_GROUPS } from "@/content/faq";
import { guides, minutesLabel } from "@/content/guides";
import { articles } from "@/content/articles";
import { faqPageSchema } from "./schema";

const title = "Window Treatment FAQs | Premier Shade Solutions Las Vegas";
const description =
  "Answers on custom blinds, shades, shutters and motorization in Las Vegas: cost, lead times, warranty, care and desert heat. Free in-home consultation.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/faq" },
  // No `images`: a page-level openGraph replaces the layout's whole object, so the share image comes
  // from ./opengraph-image.tsx, which Next fills in only while `images` is left unset.
  openGraph: { title, description, url: "/faq", type: "website" },
  twitter: { card: "summary_large_image" },
};

// The same name the guide breadcrumbs and the footer use for this page.
const trail = [{ name: "Questions & care", url: "/faq" }];

export default function FaqPage() {
  return (
    <>
      <JsonLd schema={faqPageSchema(FAQ_GROUPS)} />
      <JsonLd schema={breadcrumbSchema(trail)} />
      <PageHero
        eyebrow="Questions & care"
        title="Questions and answers"
        lead="Straight answers about blinds, shades, shutters and motorization in the Las Vegas valley, from the family who measures and installs them. Don't see yours? Ask us at your free consultation."
        trail={trail}
      />

      <Section tone="ivory" containerWidth="prose">
        <nav aria-label="On this page">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 font-display text-sm text-ink-soft">
            {FAQ_GROUPS.map((group) => (
              <li key={group.id}>
                <a href={`#${group.id}`} className="underline-offset-4 hover:text-charcoal hover:underline">
                  {group.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#buying-guides" className="underline-offset-4 hover:text-charcoal hover:underline">
                Buying guides
              </a>
            </li>
            <li>
              <a href="#care" className="underline-offset-4 hover:text-charcoal hover:underline">
                Care and repair
              </a>
            </li>
          </ul>
        </nav>

        <div className="mt-12 flex flex-col gap-16">
          {FAQ_GROUPS.map((group) => (
            <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`} className="scroll-mt-28">
              <h2 id={`${group.id}-heading`} className="text-3xl font-light tracking-tight text-charcoal">
                {group.title}
              </h2>
              <div className="mt-6 flex flex-col">
                {group.items.map((item) => (
                  <div key={item.q} className="border-t border-rule py-6">
                    <h3 className="font-display text-lg font-medium text-charcoal">{item.q}</h3>
                    <p className="mt-2 leading-relaxed text-ink-soft">{item.a}</p>
                    {item.links && item.links.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={`More on: ${item.q}`}>
                        {item.links.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              className="text-champagne-ink underline underline-offset-4 transition-colors hover:text-charcoal"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Section>

      <Section tone="ivory" id="buying-guides" className="scroll-mt-20 border-t border-rule" containerWidth="prose">
        <h2 className="text-3xl font-light tracking-tight text-charcoal">Buying guides</h2>
        <p className="mt-3 text-lg text-ink-soft">
          The questions we answer most at consultations, written out, for Las Vegas homes.
        </p>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {articles.map((article) => (
            <li key={article.slug}>
              <Link
                href={`/learn/${article.slug}`}
                className="flex h-full flex-col gap-2 border border-rule bg-white p-5 transition-colors hover:border-champagne"
              >
                <span className="font-display text-lg text-charcoal">{article.title}</span>
                <span className="text-ink-soft">{article.seo.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="ivory" id="care" className="scroll-mt-20 border-t border-rule" containerWidth="prose">
        <h2 className="text-3xl font-light tracking-tight text-charcoal">Care and repair</h2>
        <p className="mt-3 text-lg text-ink-soft">
          Step-by-step fixes with diagrams, from the installers who put them up across the Las Vegas valley.
        </p>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={`/guides/${guide.slug}`}
                className="flex h-full flex-col gap-2 border border-rule bg-white p-5 transition-colors hover:border-champagne"
              >
                <span className="font-display text-lg text-charcoal">{guide.title}</span>
                <span className="text-ink-soft">{guide.seo.description}</span>
                <span className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">
                  {minutesLabel(guide.minutes)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <BookingBlock photo={consultationPhoto} />
    </>
  );
}

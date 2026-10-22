import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { Section, SectionHeading } from "@/components/ui/Section";
import type { FaqItem } from "@/content/faq";
import { faqSchema } from "@/lib/seo/schema";

/**
 * A page's own questions and answers (content/page-faqs.ts), laid out like /faq and published as FAQPage JSON-LD,
 * so the markup and the page say the same thing. Nothing renders for a page without questions.
 *
 * Links back to `path` itself, and to /contact (these pages carry their own booking form, #book), are left out.
 */
export function PageFaq({ title, items, path }: { title: string; items: FaqItem[]; path: string }) {
  if (items.length === 0) return null;
  const linksFor = (item: FaqItem) => (item.links ?? []).filter((link) => link.href !== path && link.href !== "/contact");
  return (
    <Section tone="ivory" containerWidth="prose">
      <JsonLd schema={faqSchema(items)} />
      <SectionHeading eyebrow="Questions" title={title} />
      <div className="mt-8 flex flex-col">
        {items.map((item) => (
          <div key={item.q} className="border-t border-rule py-6">
            <h3 className="font-display text-lg font-medium text-charcoal">{item.q}</h3>
            <p className="mt-2 leading-relaxed text-ink-soft">{item.a}</p>
            {linksFor(item).length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={`More on: ${item.q}`}>
                {linksFor(item).map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-champagne-ink underline underline-offset-4 transition-colors hover:text-charcoal">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-rule pt-6 text-sm text-ink-soft">
        More answers on our{" "}
        <Link href="/faq" className="text-champagne-ink underline underline-offset-4 hover:text-charcoal">questions page</Link>.
      </p>
    </Section>
  );
}

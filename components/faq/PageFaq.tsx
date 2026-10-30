import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { Section, SectionHeading } from "@/components/ui/Section";
import { ButtonLink } from "@/components/ui/Button";
import { business } from "@/content/business";
import type { FaqItem } from "@/content/faq";
import { faqSchema } from "@/lib/seo/schema";

/**
 * A page's own questions and answers (content/page-faqs.ts), published as FAQPage JSON-LD, so the markup and the
 * page say the same thing. Nothing renders for a page without questions.
 *
 * Owner 2026-10-29: an accordion instead of a long list. Each question is a native <details>, so it opens without
 * JavaScript, works with the keyboard and screen readers, and every answer stays in the HTML for Google. The first
 * one starts open so the pattern is obvious. From lg up the heading and an "ask us" card stay in view beside the
 * questions; below lg everything stacks.
 *
 * Links back to `path` itself, and to /contact (these pages carry their own booking form, #book), are left out.
 */
export function PageFaq({ title, items, path }: { title: string; items: FaqItem[]; path: string }) {
  if (items.length === 0) return null;
  const linksFor = (item: FaqItem) => (item.links ?? []).filter((link) => link.href !== path && link.href !== "/contact");
  return (
    <Section tone="ivory">
      <JsonLd schema={faqSchema(items)} />
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col gap-6 lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
          <SectionHeading eyebrow="Questions" title={title} />
          <div className="rounded-2xl bg-sand p-6">
            <p className="font-display text-lg font-medium text-charcoal">Still have a question?</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Ask Josh at your free in-home consultation, or give us a call.
            </p>
            {/* A call, not another Invite Us Over: the page's closing CTA sits right under this section. */}
            <ButtonLink href={business.phone.href} variant="outline" className="mt-5">
              Call {business.phone.display}
            </ButtonLink>
          </div>
          <p className="text-sm text-ink-soft">
            More answers on our{" "}
            <Link href="/faq" className="text-champagne-ink underline underline-offset-4 hover:text-charcoal">questions page</Link>.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-8">
          {items.map((item, index) => (
            <details
              key={item.q}
              open={index === 0}
              className="group rounded-2xl border border-rule bg-sand/30 transition-colors open:border-champagne/60 open:bg-white open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-start gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2">
                <span aria-hidden="true" className="pt-1 font-display text-sm tabular-nums text-champagne-ink">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="flex-1 font-display text-lg font-medium text-charcoal">{item.q}</h3>
                {/* A plus that turns into a minus: the vertical bar rotates flat when the answer is open. */}
                <span aria-hidden="true" className="relative mt-1.5 size-4 shrink-0">
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-charcoal" />
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-charcoal transition-transform duration-200 group-open:rotate-90" />
                </span>
              </summary>
              <div className="px-5 pb-6 sm:px-6 sm:pl-[4.25rem]">
                <p className="leading-relaxed text-ink-soft">{item.a}</p>
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
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

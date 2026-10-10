import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/product/ProductParts";
import { business } from "@/content/business";

export const metadata: Metadata = {
  title: "Accessibility | Premier Shade Solutions",
  description:
    "Premier Shade Solutions is committed to WCAG 2.1 AA accessibility. Tell us if any part of this site is difficult to use.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <>
      <PageHero
        title="Accessibility"
        lead="If any part of this site is hard to use, we want to hear about it."
        trail={[{ name: "Accessibility", url: "/accessibility" }]}
      />

      <Section tone="ivory" containerWidth="prose">
        <div className="flex flex-col gap-8 leading-relaxed text-ink-soft">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              Our commitment
            </h2>
            <p>
              We build and maintain this site against the Web Content
              Accessibility Guidelines (WCAG) 2.1, Level AA. That means the site
              should be fully operable with a keyboard, readable by screen
              readers, legible at high zoom, and comfortable for people who
              prefer reduced motion.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              What we have done
            </h2>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              <li>Every page is navigable by keyboard, with a visible focus indicator.</li>
              <li>Every form field has a real label, and errors are announced to screen readers.</li>
              <li>Text meets the 4.5:1 contrast ratio against its background.</li>
              <li>Images carry descriptive alternative text, and decorative images are hidden from screen readers.</li>
              <li>Headings follow a logical order, with one page heading per page.</li>
              <li>Animation is reduced automatically when your device asks for it.</li>
              <li>Product menus open on keyboard focus, not hover alone.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-light tracking-tight text-charcoal">
              Tell us if something is wrong.
            </h2>
            <p>
              Accessibility is not something you finish. If you run into
              anything on this site that is difficult or impossible to use,
              please tell us and we will fix it — and in the meantime we will
              help you directly by phone or email.
            </p>
            <p>
              Call{" "}
              <a href={business.phone.href} className="underline underline-offset-2">
                {business.phone.display}
              </a>{" "}
              or email{" "}
              <a href={`mailto:${business.email}`} className="underline underline-offset-2">
                {business.email}
              </a>
              . Let us know which page and what happened, and we will get back
              to you.
            </p>
          </section>
        </div>
      </Section>
    </>
  );
}

import { Section } from "@/components/ui/Section";

/** A product's feature list as a two-column checklist (spec 2026-10-01 §4.5). */
export function DetailsBand({ features }: { features: string[] }) {
  return (
    <Section tone="sand">
      <h2 className="heading-serif mb-8 text-3xl text-charcoal">Details</h2>
      <ul className="grid gap-x-12 gap-y-4 md:grid-cols-2">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-base leading-relaxed text-charcoal">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-1 size-4 shrink-0 fill-none stroke-champagne-ink stroke-[2.5]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
    </Section>
  );
}

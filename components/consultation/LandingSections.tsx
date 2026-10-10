import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { PAINS, STEPS } from "@/content/consultation";

/** Sections shared by the ad landing pages: /consultation and /holiday. */

/** The five things customers say go wrong with window companies, and how we do each one. */
export function PainsSection() {
  return (
    <Section tone="ivory">
      <div className="flex flex-col gap-3">
        <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-champagne-ink">No runaround</p>
        <h2 className="heading-serif max-w-3xl text-3xl leading-tight text-charcoal md:text-5xl">
          What usually goes wrong, and how we do it
        </h2>
      </div>
      <ul className="mt-10 grid gap-px bg-rule md:grid-cols-2 lg:grid-cols-3">
        {PAINS.map((pain, index) => (
          <li key={pain.answer} className="bg-ivory">
            <Reveal delayMs={index * 80} className="flex h-full flex-col gap-3 p-6 md:p-8">
              <p className="text-sm italic text-ink-soft">{pain.heard}</p>
              <h3 className="font-display text-xl font-medium text-charcoal">{pain.answer}</h3>
              <p className="leading-relaxed text-ink-soft">{pain.body}</p>
            </Reveal>
          </li>
        ))}
        {/* Five promises leave the sixth cell of the three-column grid empty; it carries the next step instead. */}
        <li className="bg-charcoal md:col-span-2 lg:col-span-1">
          <div className="flex h-full flex-col justify-center gap-4 p-6 md:p-8">
            <p className="font-display text-xl font-medium text-ivory">See the difference in your own home.</p>
            <a
              href="#book"
              className="font-display text-sm uppercase tracking-[0.14em] text-champagne underline-offset-4 hover:underline"
            >
              Book your free consultation →
            </a>
          </div>
        </li>
      </ul>
    </Section>
  );
}

export function HowItWorks() {
  return (
    <Section tone="sand">
      <h2 className="heading-serif text-3xl text-charcoal md:text-4xl">How it works</h2>
      <ol className="mt-10 grid gap-8 md:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2">
            <span className="font-display text-sm font-medium text-champagne-ink">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="font-display text-lg font-medium text-charcoal">{step.title}</h3>
            <p className="leading-relaxed text-ink-soft">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function QuestionsSection({ faq }: { faq: { q: string; a: string }[] }) {
  return (
    <Section tone="ivory" containerWidth="prose">
      <h2 className="text-2xl font-light text-charcoal">Common questions</h2>
      <div className="mt-3">
        {faq.map(({ q, a }, index) => (
          <details key={q} open={index === 0} className="border-t border-rule py-4">
            <summary className="cursor-pointer font-display font-medium text-charcoal">{q}</summary>
            <p className="mt-2 leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

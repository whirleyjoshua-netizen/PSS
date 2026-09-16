import { stepDateLabel, type ProjectStep, type StepKey } from "@/lib/portal/progress";

/**
 * A fixed line per step. The updates list is built from the step dates and these
 * labels alone — an event body is never rendered to a customer.
 */
const UPDATE: Record<StepKey, string> = {
  consultation: "We visited your home.",
  measurements: "We measured your windows.",
  quote: "Your quote was ready.",
  order: "Your order was confirmed.",
  production: "Your order went into production.",
  ready: "Your installation was scheduled.",
  installed: "Your installation was completed.",
};

export function UpdatesList({ steps }: { steps: ProjectStep[] }) {
  const dated = steps.filter((step) => step.state !== "upcoming" && step.on !== null).reverse();

  return (
    <section className="flex flex-col gap-4" aria-labelledby="updates-heading">
      <h2 id="updates-heading" className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">
        Project updates
      </h2>
      {dated.length === 0 ? (
        <p className="text-ink-soft">Updates will appear here as your project moves along.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-rule border-t border-rule">
          {dated.map((step) => (
            <li key={step.key} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <span>{UPDATE[step.key]}</span>
              <span className="text-sm text-ink-soft">{stepDateLabel(step)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

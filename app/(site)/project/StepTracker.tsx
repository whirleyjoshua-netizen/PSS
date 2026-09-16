import { stepDateLabel, type ProjectStep } from "@/lib/portal/progress";

/** Complete literal class names per state — never built by concatenation. */
const EDGE = {
  done: "border-l-2 border-charcoal pl-4 md:border-l-0 md:border-t-2 md:pl-0 md:pt-3",
  current: "border-l-2 border-champagne-ink pl-4 md:border-l-0 md:border-t-2 md:pl-0 md:pt-3",
  upcoming: "border-l-2 border-rule pl-4 text-ink-soft md:border-l-0 md:border-t-2 md:pl-0 md:pt-3",
} as const;

const MARK = { done: "✓", current: "●", upcoming: "○" } as const;
const SR = { done: "(done)", current: "(current step)", upcoming: "(coming up)" } as const;

/**
 * The seven steps: stacked until there is genuinely desktop room for them. Seven columns
 * at 640px leaves about 70px of text each, which "Ready to Install" plus "Scheduled Oct 13"
 * cannot wear, so the row starts at md:.
 */
export function StepTracker({ steps }: { steps: ProjectStep[] }) {
  return (
    <ol className="flex flex-col gap-3 md:flex-row md:gap-3">
      {steps.map((step) => (
        <li
          key={step.key}
          aria-current={step.state === "current" ? "step" : undefined}
          className={`flex gap-3 md:flex-1 md:flex-col md:gap-1 ${EDGE[step.state]}`}
        >
          <span aria-hidden="true" className="w-4 shrink-0">{MARK[step.state]}</span>
          <div className="flex flex-col">
            <span className={step.state === "current" ? "font-semibold" : undefined}>{step.label}</span>
            <span className="sr-only">{SR[step.state]}</span>
            {step.on ? <span className="text-sm text-ink-soft">{stepDateLabel(step)}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

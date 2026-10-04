import type { GuideStep } from "@/content/guides";
import { Diagram } from "@/components/guides/diagrams";

export function StepCard({ step, index }: { step: GuideStep; index: number }) {
  return (
    <li className="flex flex-col gap-2 border border-rule bg-white p-5">
      <Diagram id={step.diagram} />
      <p className="mt-2 font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">
        Step {index + 1}
        {step.sideView ? " · side view" : ""}
      </p>
      <h3 className="text-lg font-medium text-charcoal">{step.title}</h3>
      <p className="leading-relaxed text-ink-soft">{step.body}</p>
    </li>
  );
}

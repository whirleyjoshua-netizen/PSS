import { Icon } from "@/components/admin/icons";
import { STAGES, STAGE_STYLE, type Stage, type WorkingStage } from "@/lib/admin/stages";

/** Fill for done and current steps. Complete literals so Tailwind generates them. */
const FILL: Record<WorkingStage, string> = {
  new: "bg-stage-new",
  contacted: "bg-stage-contacted",
  visit_booked: "bg-stage-visit",
  quoted: "bg-stage-quoted",
  approved: "bg-stage-approved",
  signed: "bg-stage-signed",
  sold: "bg-stage-sold",
  measure: "bg-stage-measure",
  ordered: "bg-stage-ordered",
  installed: "bg-stage-installed",
  completed: "bg-stage-completed",
};

export function StageStepper({ status }: { status: Stage }) {
  const lost = status === "lost";
  const currentIndex = STAGES.findIndex((stage) => stage.value === status);

  return (
    <ol aria-label="Stage" className={`flex overflow-x-auto pb-1 ${lost ? "opacity-50" : ""}`}>
      {STAGES.map((stage, index) => {
        const done = !lost && index < currentIndex;
        const current = !lost && index === currentIndex;
        return (
          <li
            key={stage.value}
            aria-current={current ? "step" : undefined}
            data-state={done ? "done" : current ? "current" : "upcoming"}
            className="relative flex min-w-12 flex-1 flex-col items-center gap-2 text-center"
          >
            {index > 0 ? (
              <span aria-hidden="true" className={`absolute right-1/2 top-3.5 h-0.5 w-full ${done || current ? "bg-charcoal" : "bg-rule"}`} />
            ) : null}
            <span
              aria-hidden="true"
              className={`relative flex size-7 items-center justify-center rounded-full border-2 text-xs ${
                done || current ? `border-transparent text-ivory ${FILL[stage.value]}` : "border-rule bg-ivory text-ink-soft"
              }`}
            >
              {done ? "✓" : current ? <Icon name={STAGE_STYLE[stage.value].icon} className="size-3.5" /> : null}
            </span>
            <span className={`text-xs ${current ? "font-semibold text-charcoal" : "text-ink-soft max-sm:sr-only"}`}>
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

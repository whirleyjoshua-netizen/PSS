import type { IconName } from "@/components/admin/icons";

/**
 * The one definition of the job stages. The database enforces the same list
 * with a check constraint in 002_job_tracker.sql; keep the two in step.
 */
export const STAGES = [
  { value: "new", label: "New lead" },
  { value: "contacted", label: "Contacted" },
  { value: "visit_booked", label: "Visit booked" },
  { value: "quoted", label: "Quoted" },
  { value: "sold", label: "Sold" },
  { value: "ordered", label: "Ordered" },
  { value: "installed", label: "Installed" },
] as const;

export type Stage = (typeof STAGES)[number]["value"] | "lost";

export const ALL_STAGES: readonly Stage[] = [...STAGES.map((s) => s.value), "lost"];

export const isStage = (value: unknown): value is Stage =>
  typeof value === "string" && (ALL_STAGES as readonly string[]).includes(value);

export const stageLabel = (stage: Stage): string =>
  stage === "lost" ? "Lost" : STAGES.find((s) => s.value === stage)!.label;

/** The stage the primary button moves to, or null when there is none. */
export function nextStage(stage: Stage): Stage | null {
  const index = STAGES.findIndex((s) => s.value === stage);
  return index === -1 || index === STAGES.length - 1 ? null : STAGES[index + 1].value;
}

export const WORKING_STAGES = ["new", "contacted", "visit_booked", "quoted", "sold", "ordered", "installed"] as const;
export type WorkingStage = (typeof WORKING_STAGES)[number];

export const parseWorkingStage = (value: string | null | undefined): WorkingStage | null =>
  (WORKING_STAGES as readonly string[]).includes(value ?? "") ? (value as WorkingStage) : null;

/**
 * Each stage's icon and color classes. The class names are complete literals so
 * Tailwind generates them; never build them by concatenation.
 */
export const STAGE_STYLE: Record<Stage, { icon: IconName; edge: string; tint: string; left: string }> = {
  new: { icon: "lead", edge: "border-t-stage-new", tint: "text-stage-new", left: "border-l-stage-new" },
  contacted: { icon: "phone", edge: "border-t-stage-contacted", tint: "text-stage-contacted", left: "border-l-stage-contacted" },
  visit_booked: { icon: "calendar", edge: "border-t-stage-visit", tint: "text-stage-visit", left: "border-l-stage-visit" },
  quoted: { icon: "document", edge: "border-t-stage-quoted", tint: "text-stage-quoted", left: "border-l-stage-quoted" },
  sold: { icon: "cart", edge: "border-t-stage-sold", tint: "text-stage-sold", left: "border-l-stage-sold" },
  ordered: { icon: "box", edge: "border-t-stage-ordered", tint: "text-stage-ordered", left: "border-l-stage-ordered" },
  installed: { icon: "wrench", edge: "border-t-stage-installed", tint: "text-stage-installed", left: "border-l-stage-installed" },
  lost: { icon: "lost", edge: "border-t-taupe", tint: "text-taupe", left: "border-l-taupe" },
};

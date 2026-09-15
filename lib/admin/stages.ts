import type { IconName } from "@/components/admin/icons";

/**
 * The one definition of the job stages. The database enforces the same list
 * with a check constraint (011_stages_contact_log.sql); keep the two in step.
 */
export const STAGES = [
  { value: "new", label: "New lead" },
  { value: "visit_booked", label: "Appointment booked" },
  { value: "quoted", label: "Quoted" },
  { value: "sold", label: "Sold" },
  { value: "ordered", label: "Ordered" },
  { value: "installed", label: "Installed" },
  { value: "completed", label: "Completed" },
] as const;

export type Stage = (typeof STAGES)[number]["value"] | "lost";

export const ALL_STAGES: readonly Stage[] = [...STAGES.map((s) => s.value), "lost"];

export const isStage = (value: unknown): value is Stage =>
  typeof value === "string" && (ALL_STAGES as readonly string[]).includes(value);

/** Stages retired from the tracker that old activity entries still mention. */
const RETIRED_LABELS: Record<string, string> = { contacted: "Contacted" };

export const stageLabel = (stage: string): string =>
  stage === "lost" ? "Lost" : STAGES.find((s) => s.value === stage)?.label ?? RETIRED_LABELS[stage] ?? stage;

/** The stage the primary button moves to, or null when there is none. */
export function nextStage(stage: Stage): Stage | null {
  const index = STAGES.findIndex((s) => s.value === stage);
  return index === -1 || index === STAGES.length - 1 ? null : STAGES[index + 1].value;
}

export const WORKING_STAGES = ["new", "visit_booked", "quoted", "sold", "ordered", "installed", "completed"] as const;
export type WorkingStage = (typeof WORKING_STAGES)[number];

export const parseWorkingStage = (value: string | null | undefined): WorkingStage | null =>
  (WORKING_STAGES as readonly string[]).includes(value ?? "") ? (value as WorkingStage) : null;

/** The Kanban's columns: current work only. Completed and Lost live in the job list. */
export const BOARD_STAGES = ["new", "visit_booked", "quoted", "sold", "ordered", "installed"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

/** The one definition of "the install has happened", for reviews, referrals and hand-entered jobs. */
export const INSTALLED_STATUSES = ["installed", "completed"] as const;
export const isInstalled = (status: string): boolean => (INSTALLED_STATUSES as readonly string[]).includes(status);

/**
 * Each stage's icon and color classes. The class names are complete literals so
 * Tailwind generates them; never build them by concatenation.
 */
export const STAGE_STYLE: Record<Stage, { icon: IconName; edge: string; tint: string; left: string }> = {
  new: { icon: "lead", edge: "border-t-stage-new", tint: "text-stage-new", left: "border-l-stage-new" },
  visit_booked: { icon: "calendar", edge: "border-t-stage-visit", tint: "text-stage-visit", left: "border-l-stage-visit" },
  quoted: { icon: "document", edge: "border-t-stage-quoted", tint: "text-stage-quoted", left: "border-l-stage-quoted" },
  sold: { icon: "cart", edge: "border-t-stage-sold", tint: "text-stage-sold", left: "border-l-stage-sold" },
  ordered: { icon: "box", edge: "border-t-stage-ordered", tint: "text-stage-ordered", left: "border-l-stage-ordered" },
  installed: { icon: "wrench", edge: "border-t-stage-installed", tint: "text-stage-installed", left: "border-l-stage-installed" },
  completed: { icon: "check", edge: "border-t-stage-completed", tint: "text-stage-completed", left: "border-l-stage-completed" },
  lost: { icon: "lost", edge: "border-t-taupe", tint: "text-taupe", left: "border-l-taupe" },
};

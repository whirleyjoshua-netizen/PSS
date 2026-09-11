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

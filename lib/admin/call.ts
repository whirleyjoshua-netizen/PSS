import { categories } from "@/content/products";
import { budgetLabel, type BudgetTier } from "./budget";
import type { Stage } from "./stages";
import { formatCallVisit } from "./time";

export const CALL_OUTCOMES = ["booked", "talked", "no_answer"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** The same interest options as the website consultation form. */
export const TREATMENT_NAMES: string[] = categories.map((category) => category.name);

export type CallInput = {
  outcome: CallOutcome;
  treatments: string[];
  windowCount: string | null;
  budgetTier: BudgetTier | null;
  notes: string | null;
  visitAt: Date | null;
};

/** Where a call's outcome may move the job, and only from which stages. Forward only. */
export function callStageMove(outcome: CallOutcome): { to: "visit_booked" | "contacted"; from: Stage[] } | null {
  if (outcome === "booked") return { to: "visit_booked", from: ["new", "contacted"] };
  if (outcome === "talked") return { to: "contacted", from: ["new"] };
  return null;
}

const OUTCOME_TEXT: Record<CallOutcome, string> = {
  booked: "booked visit",
  talked: "talked, no visit yet",
  no_answer: "no answer",
};

/** One activity line for the call. Empty parts are left out; notes are not included. */
export function callSummary(input: CallInput): string {
  const outcome = input.outcome === "booked" && input.visitAt
    ? `${OUTCOME_TEXT.booked} ${formatCallVisit(input.visitAt)}`
    : OUTCOME_TEXT[input.outcome];
  const parts = [
    input.treatments.join(", "),
    input.windowCount ? `${input.windowCount} windows` : "",
    input.budgetTier ? budgetLabel(input.budgetTier) : "",
  ].filter(Boolean);
  return [`Call: ${outcome}`, ...parts].join(" · ");
}

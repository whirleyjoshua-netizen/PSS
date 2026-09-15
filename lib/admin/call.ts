import { budgetLabel, type BudgetTier } from "./budget";
import type { Stage } from "./stages";
import { formatCallVisit } from "./time";
import { treatmentTypeLabels, type TreatmentType } from "@/lib/leads/treatment-types";
import { windowsPhrase } from "@/lib/leads/window-count";

export const CALL_OUTCOMES = ["booked", "talked", "no_answer"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export type CallInput = {
  outcome: CallOutcome;
  treatmentTypes: TreatmentType[];
  motorized: boolean;
  windowCountExact: number | null;
  gateCode: string | null;
  budgetTier: BudgetTier | null;
  notes: string | null;
  visitAt: Date | null;
  followUpAt: Date | null;
  followUpNote: string | null;
};

/** Where a call's outcome may move the job, and only from which stages. Only a booked visit moves it. */
export function callStageMove(outcome: CallOutcome): { to: "visit_booked"; from: Stage[] } | null {
  if (outcome === "booked") return { to: "visit_booked", from: ["new"] };
  return null;
}

const OUTCOME_TEXT: Record<CallOutcome, string> = {
  booked: "booked visit",
  talked: "talked, no visit yet",
  no_answer: "no answer",
};

/** One activity line for the call. Empty parts are left out; notes are not included. Never includes the gate code. */
export function callSummary(input: CallInput): string {
  const outcome = input.outcome === "booked" && input.visitAt
    ? `${OUTCOME_TEXT.booked} ${formatCallVisit(input.visitAt)}`
    : OUTCOME_TEXT[input.outcome];
  const parts = [
    treatmentTypeLabels(input.treatmentTypes).join(", "),
    input.motorized ? "Motorized" : "",
    input.windowCountExact !== null ? windowsPhrase(input.windowCountExact) : "",
    input.budgetTier ? budgetLabel(input.budgetTier) : "",
  ].filter(Boolean);
  const callBack = input.followUpAt
    ? [`Call back ${formatCallVisit(input.followUpAt)}`, ...(input.followUpNote ? [input.followUpNote] : [])]
    : [];
  return [`Call: ${outcome}`, ...parts, ...callBack].join(" · ");
}

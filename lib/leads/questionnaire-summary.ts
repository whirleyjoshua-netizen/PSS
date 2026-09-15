import { finishLabel } from "./finish";
import type { QuestionnaireAnswers } from "./questionnaire-schema";
import { treatmentTypeLabels, type TreatmentType } from "./treatment-types";
import { windowsPhrase } from "./window-count";

/** The activity line for a questionnaire save. Never includes the gate code or address. */
export function questionnaireSummary(
  a: Omit<QuestionnaireAnswers, "treatmentTypes"> & { treatmentTypes: readonly TreatmentType[] },
): string {
  const parts = [
    a.windowCountExact !== null ? windowsPhrase(a.windowCountExact) : "",
    treatmentTypeLabels(a.treatmentTypes).join(", "),
    a.motorized ? "Motorized" : "",
    a.finish === "not_sure" ? "Finish not sure yet" : a.finish ? finishLabel(a.finish) : "",
  ].filter(Boolean);
  return parts.length ? `Customer added details: ${parts.join(" · ")}` : "Customer added details";
}

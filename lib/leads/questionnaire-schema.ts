import { z } from "zod";
import { FINISHES, type Finish } from "./finish";
import { TREATMENT_TYPE_KEYS, type TreatmentType } from "./treatment-types";
import { WINDOW_EXACT_MAX } from "./window-count";

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const WINDOWS = "Pick how many windows";

/** Shared with the call screen and Job details, so every place stores the same values. */
export const windowCountExactField = z
  .preprocess(blank, z.coerce.number({ error: WINDOWS }).int(WINDOWS).min(1, WINDOWS).max(WINDOW_EXACT_MAX, WINDOWS).optional())
  .transform((value) => value ?? null);

export const treatmentTypesField = z
  .array(z.enum(TREATMENT_TYPE_KEYS, { error: "Pick from the listed treatments" }))
  .default([])
  .transform((keys): TreatmentType[] => [...new Set(keys)]);

export const gateCodeField = z
  .preprocess(blank, z.string().trim().max(40, "Keep the gate code under 40 characters").optional())
  .transform((value) => value ?? null);

export const questionnaireSchema = z.object({
  windowCountExact: windowCountExactField,
  treatmentTypes: treatmentTypesField,
  motorized: z.boolean().default(false),
  address: z
    .preprocess(blank, z.string().trim().max(200, "Keep the address under 200 characters").optional())
    .transform((value) => value ?? null),
  gateCode: gateCodeField,
  finish: z
    .preprocess(blank, z.enum(FINISHES, { error: "Pick a finish" }).optional())
    .transform((value): Finish | null => value ?? null),
});

export type QuestionnaireAnswers = z.output<typeof questionnaireSchema>;

export const isEmptyAnswers = (a: QuestionnaireAnswers): boolean =>
  a.windowCountExact === null && a.treatmentTypes.length === 0 && !a.motorized &&
  a.address === null && a.gateCode === null && a.finish === null;

export const QUESTIONNAIRE_EXPIRED = "This form has expired — call us and we'll take it from here.";

export type QuestionnaireState = { error?: string; values?: Record<string, string | string[]> };

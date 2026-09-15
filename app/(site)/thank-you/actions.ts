"use server";

import { cookies } from "next/headers";
import { saveQuestionnaire } from "@/lib/leads/questionnaire";
import { QUESTIONNAIRE_COOKIE } from "@/lib/leads/questionnaire-cookie";
import {
  isEmptyAnswers, QUESTIONNAIRE_EXPIRED, questionnaireSchema, type QuestionnaireState,
} from "@/lib/leads/questionnaire-schema";

const FIELDS = ["windowCountExact", "treatmentTypes", "motorized", "address", "gateCode", "finish"];

function captureValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of FIELDS) {
    const all = formData.getAll(key);
    if (all.length === 0) continue;
    values[key] = all.length > 1 ? all.map(String) : String(all[0]);
  }
  return values;
}

// The lead is identified only by the pss_q cookie, never by anything in the form.
// Submitted values come back on success too, so the form keeps showing them.
export async function submitQuestionnaire(_prev: QuestionnaireState, formData: FormData): Promise<QuestionnaireState> {
  const key = (await cookies()).get(QUESTIONNAIRE_COOKIE)?.value;
  if (!key) return { error: QUESTIONNAIRE_EXPIRED };
  const values = captureValues(formData);
  const parsed = questionnaireSchema.safeParse({
    windowCountExact: formData.get("windowCountExact") ?? "",
    treatmentTypes: formData.getAll("treatmentTypes").map(String),
    motorized: formData.get("motorized") === "on",
    address: formData.get("address") ?? "",
    gateCode: formData.get("gateCode") ?? "",
    finish: formData.get("finish") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (isEmptyAnswers(parsed.data)) return { ok: true, values };
  try {
    const saved = await saveQuestionnaire(key, parsed.data);
    if (!saved) return { error: QUESTIONNAIRE_EXPIRED, values };
  } catch (error) {
    console.error("Questionnaire save failed", error);
    return { error: "We couldn't save that. Please try again, or call us.", values };
  }
  return { ok: true, values };
}

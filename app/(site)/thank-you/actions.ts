"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { saveQuestionnaire } from "@/lib/leads/questionnaire";
import { geocodeLead } from "@/lib/routes/geocode";
import { QUESTIONNAIRE_COOKIE } from "@/lib/leads/questionnaire-cookie";
import {
  isEmptyAnswers, QUESTIONNAIRE_EXPIRED, questionnaireSchema, type QuestionnaireState,
} from "@/lib/leads/questionnaire-schema";

const FIELDS = ["windowCountExact", "treatmentTypes", "motorized", "address", "finish"];

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
// On success the visitor is sent to the all-set page; on failure the submitted
// values come back so the form keeps them.
export async function submitQuestionnaire(_prev: QuestionnaireState, formData: FormData): Promise<QuestionnaireState> {
  const key = (await cookies()).get(QUESTIONNAIRE_COOKIE)?.value;
  if (!key) return { error: QUESTIONNAIRE_EXPIRED };
  const values = captureValues(formData);
  const parsed = questionnaireSchema.safeParse({
    windowCountExact: formData.get("windowCountExact") ?? "",
    treatmentTypes: formData.getAll("treatmentTypes").map(String),
    motorized: formData.get("motorized") === "on",
    address: formData.get("address") ?? "",
    finish: formData.get("finish") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (isEmptyAnswers(parsed.data)) redirect("/thank-you/all-set");
  let savedId: string | null = null;
  try {
    savedId = await saveQuestionnaire(key, parsed.data);
    if (!savedId) return { error: QUESTIONNAIRE_EXPIRED, values };
  } catch (error) {
    console.error("Questionnaire save failed", error);
    return { error: "We couldn't save that. Please try again, or call us.", values };
  }
  // A new address gets coordinates for the route planner. Never blocks the redirect.
  const leadId = savedId;
  if (leadId && parsed.data.address) after(() => geocodeLead(leadId));
  redirect("/thank-you/all-set");
}

import "server-only";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/admin/tokens";
import { isFinish, tierForFinish } from "./finish";
import type { QuestionnaireAnswers } from "./questionnaire-schema";
import { questionnaireSummary } from "./questionnaire-summary";
import { isTreatmentType } from "./treatment-types";

/**
 * The questionnaire behind a key: only its own answers, the address and the first form's
 * window range. Nothing else about the lead. A wrong or expired key finds nothing.
 */
export async function findQuestionnaire(
  key: string | undefined,
): Promise<{ windowRange: string | null; answers: QuestionnaireAnswers } | null> {
  if (!key) return null;
  const rows = await db()`
    select window_count, window_count_exact, treatment_types, motorized, address, finish
    from leads
    where questionnaire_token_hash = ${hashToken(key)} and questionnaire_expires_at > now()`;
  const row = rows[0];
  if (!row) return null;
  return {
    windowRange: (row.window_count as string | null) ?? null,
    answers: {
      windowCountExact: (row.window_count_exact as number | null) ?? null,
      treatmentTypes: ((row.treatment_types as unknown[]) ?? []).filter(isTreatmentType),
      motorized: row.motorized === true,
      address: (row.address as string | null) ?? null,
      finish: isFinish(row.finish) ? row.finish : null,
    },
  };
}

/**
 * Saves the answers and logs one note, in one statement. Only questionnaire fields change:
 * the address only when given, the budget tier only for a real finish, and never the stage.
 * Returns false when the key is wrong or expired.
 */
/** Saves the answers against the key's lead. Returns that lead's id, or null for a wrong or expired key. */
export async function saveQuestionnaire(key: string, a: QuestionnaireAnswers): Promise<string | null> {
  const rows = await db()`
    with updated as (
      update leads set
        window_count_exact = ${a.windowCountExact}, treatment_types = ${a.treatmentTypes}::text[],
        motorized = ${a.motorized}, finish = ${a.finish},
        address = coalesce(${a.address}::text, address),
        lat = case when coalesce(${a.address}::text, address) is distinct from address then null else lat end,
        lng = case when coalesce(${a.address}::text, address) is distinct from address then null else lng end,
        geocode_status = case when coalesce(${a.address}::text, address) is distinct from address then null else geocode_status end,
        geocoded_at = case when coalesce(${a.address}::text, address) is distinct from address then null else geocoded_at end,
        budget_tier = case when ${a.finish}::text is distinct from finish
          then coalesce(${tierForFinish(a.finish)}::text, budget_tier) else budget_tier end,
        updated_at = now()
      where questionnaire_token_hash = ${hashToken(key)} and questionnaire_expires_at > now()
      returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, 'customer', 'note', ${questionnaireSummary(a)} from updated
    returning lead_id as id`;
  return (rows[0]?.id as string | undefined) ?? null;
}

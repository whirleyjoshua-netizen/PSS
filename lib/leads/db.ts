import { db } from "@/lib/db";
import type { ConsultationInput } from "./schema";

/**
 * Inserts a lead with the id the caller chose (so the notification email can
 * link to it).
 *
 * With a questionnaire key hash, the thank-you questionnaire can add details for 24 hours.
 *
 * Throws if the connection string is missing or the write fails. The caller is
 * expected to tolerate that — see app/api/consultation/route.ts, which still
 * reports success to the visitor as long as the notification email got out.
 */
export async function insertLead(
  input: ConsultationInput & { referredBy?: string | null; id: string; questionnaireTokenHash?: string | null },
): Promise<{ id: string }> {
  const sql = db();
  const hash = input.questionnaireTokenHash ?? null;

  const rows = await sql`
    insert into leads
      (id, name, phone, email, address, city, treatments, window_count, heard_via, notes, source, referred_by,
       questionnaire_token_hash, questionnaire_expires_at)
    values
      (${input.id}, ${input.name}, ${input.phone}, ${input.email}, ${input.address ?? null},
       ${input.city}, ${input.treatments ?? []}, ${input.windowCount ?? null},
       ${input.heardVia ?? null}, ${input.notes ?? null}, ${input.source}, ${input.referredBy ?? null},
       ${hash}, case when ${hash}::text is null then null else now() + interval '24 hours' end)
    returning id
  `;

  const id = rows[0]?.id;
  if (typeof id !== "string") {
    throw new Error("Lead insert returned no id");
  }

  return { id };
}

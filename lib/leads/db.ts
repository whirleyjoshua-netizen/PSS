import { neon } from "@neondatabase/serverless";
import type { ConsultationInput } from "./schema";

/**
 * Inserts a lead and returns its id.
 *
 * Throws if DATABASE_URL is unset or the write fails. The caller is expected
 * to tolerate that failure — see app/api/consultation/route.ts, which still
 * reports success to the visitor as long as the notification email got out.
 */
export async function insertLead(
  input: ConsultationInput,
): Promise<{ id: string }> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const sql = neon(connectionString);

  const rows = await sql`
    insert into leads
      (name, phone, email, address, city, treatments, window_count, heard_via, notes, source)
    values
      (${input.name}, ${input.phone}, ${input.email}, ${input.address ?? null},
       ${input.city}, ${input.treatments ?? []}, ${input.windowCount ?? null},
       ${input.heardVia ?? null}, ${input.notes ?? null}, ${input.source})
    returning id
  `;

  const id = rows[0]?.id;
  if (typeof id !== "string") {
    throw new Error("Lead insert returned no id");
  }

  return { id };
}

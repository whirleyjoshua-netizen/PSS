import { neon } from "@neondatabase/serverless";
import type { ConsultationInput } from "./schema";

/**
 * POSTGRES_URL is preferred over DATABASE_URL, and the order matters.
 *
 * The Neon integration sets both to the same value. DATABASE_URL is also a
 * conventional name that other projects define machine-wide, and a real
 * environment variable takes precedence over .env.local — so a developer with
 * an unrelated local Postgres can silently point this app at the wrong
 * database. POSTGRES_URL is specific enough not to collide.
 */
function connectionString(): string {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("No database connection string (POSTGRES_URL or DATABASE_URL)");
  }
  return url;
}

/**
 * Inserts a lead and returns its id.
 *
 * Throws if the connection string is missing or the write fails. The caller is
 * expected to tolerate that — see app/api/consultation/route.ts, which still
 * reports success to the visitor as long as the notification email got out.
 */
export async function insertLead(
  input: ConsultationInput,
): Promise<{ id: string }> {
  const sql = neon(connectionString());

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

import { db } from "@/lib/db";
import type { GoogleLead } from "./google-lead-form";
import { GOOGLE_FORM_SOURCE, leadSourceLabel } from "./schema";

export { GOOGLE_FORM_SOURCE };
export const GOOGLE_FORM_HEARD_VIA = leadSourceLabel(GOOGLE_FORM_SOURCE);

/**
 * Stores a Google lead form lead with the id the caller chose (so the
 * notification email can link to it), in one statement.
 *
 * Google resends a lead it isn't sure we got: the unique index on
 * google_lead_id (migration 039) makes the resend insert nothing, and null
 * comes back so the caller sends no second email.
 *
 * Assigned to the Settings default (lead_settings, migration 023) read in this
 * same statement, as lib/leads/db.ts does for website leads. The ZIP is the
 * address. The click time is now: Google posts the lead as it is submitted.
 *
 * Throws if the connection string is missing or the write fails.
 */
export async function insertGoogleLead(lead: GoogleLead & { id: string }): Promise<{ id: string } | null> {
  const sql = db();

  const rows = await sql`
    insert into leads
      (id, name, phone, email, address, city, heard_via, notes, source, assigned_to,
       gclid, utm_source, utm_medium, ad_clicked_at, google_lead_id)
    values
      (${lead.id}, ${lead.name}, ${lead.phone}, ${lead.email}, ${lead.zip},
       ${lead.city}, ${GOOGLE_FORM_HEARD_VIA}, ${lead.notes}, ${GOOGLE_FORM_SOURCE},
       (select default_assignee from lead_settings where id),
       ${lead.gclid}, ${"google"}, ${"cpc"}, now(), ${lead.googleLeadId})
    on conflict (google_lead_id) where google_lead_id is not null do nothing
    returning id
  `;

  const id = rows[0]?.id;
  return typeof id === "string" ? { id } : null;
}

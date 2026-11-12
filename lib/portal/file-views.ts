import "server-only";
import { db } from "@/lib/db";

/** The Activity line for a client's first open of a shared document. Team only: clients never see the timeline. */
export const openedBody = (fileName: string) => `Opened ${fileName} on their project page`;

/**
 * Logs the first time a client opens a shared document from their project page (owner 2026-11-12:
 * "how can I tell the client saw the quote"). One statement: the event is written only when this
 * job has no such line for this file yet, so reopening it, or reloading the PDF, adds nothing.
 * Photos are not logged. A quote is logged as a 'quote' event, anything else as a 'file' event.
 */
export async function recordFileOpened(input: { leadId: string; fileName: string; docType: string | null; email: string }): Promise<void> {
  const body = openedBody(input.fileName);
  const kind = input.docType === "quote" ? "quote" : "file";
  await db()`
    insert into job_events (lead_id, actor, kind, body)
    select ${input.leadId}, ${input.email}, ${kind}, ${body}
    where not exists (
      select 1 from job_events where lead_id = ${input.leadId} and kind = ${kind} and body = ${body}
    )`;
}

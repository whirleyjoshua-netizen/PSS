import "server-only";
import { calendarConfig } from "./config";
import { GraphError, graphFetch } from "./graph";

/**
 * Removes one event from the shared Outlook mailbox. The single way this app deletes a remote
 * event: the sync uses it when a job's date goes away (Mark lost, an unconfirmed appointment),
 * and deleteJob uses it for a job that is being destroyed outright.
 *
 * A 404 is success — the event is already gone, which is all the caller wanted. A claim
 * placeholder (see store.claimLink) never reached Outlook, so there is nothing to delete.
 * Does nothing at all when Outlook is not configured, so no caller has to check first.
 */
export async function deleteEvent(eventId: string): Promise<void> {
  if (eventId.startsWith("pending:")) return;
  const config = calendarConfig();
  if (!config) return;
  const response = await graphFetch(
    `users/${config.mailbox}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new GraphError(`Outlook delete failed (${response.status})`, response.status);
  }
}

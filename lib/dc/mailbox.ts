import "server-only";
import { graphJson } from "@/lib/calendar/graph";
import { DC_SENDER, DC_SUBJECT, dcMailbox } from "./config";

export type MailMessage = { id: string; internetMessageId: string; subject: string; from: string; receivedAt: Date };
type GraphMessage = { id: string; internetMessageId: string; subject: string | null; receivedDateTime: string; from?: { emailAddress?: { address?: string } } };
const MAX_BYTES = 1_000_000;

/**
 * DC-shaped messages received since `since`. READ ONLY: this module only ever GETs. The mailbox
 * is a working inbox, so nothing here moves, flags, marks read or deletes anything.
 * Keyed later on internetMessageId, which survives the owner moving the email to a folder
 * (Graph's own id does not).
 */
export async function listCandidateMessages(since: Date): Promise<MailMessage[]> {
  const mailbox = dcMailbox();
  if (!mailbox) return [];
  const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
  let next: string | null =
    `users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$orderby=receivedDateTime asc&$top=50` +
    `&$select=id,internetMessageId,subject,from,receivedDateTime`;
  const found: MailMessage[] = [];
  while (next) {
    const page: { value: GraphMessage[]; "@odata.nextLink"?: string } = await graphJson(next);
    for (const m of page.value) {
      const from = (m.from?.emailAddress?.address ?? "").trim().toLowerCase();
      const subject = (m.subject ?? "").trim();
      if (from !== DC_SENDER || !DC_SUBJECT.test(subject)) continue;
      found.push({ id: m.id, internetMessageId: m.internetMessageId, subject, from, receivedAt: new Date(m.receivedDateTime) });
    }
    next = page["@odata.nextLink"] ?? null;
  }
  return found;
}

/**
 * Every .html file attachment on the message, so the caller counts all of them. `bytes` is the
 * decoded file, or null when it is over 1 MB (not a Dealer Copy) or arrived empty: such a file
 * still counts, and makes the message unreadable rather than silently disappearing.
 */
export async function htmlAttachments(messageId: string): Promise<{ name: string; bytes: Buffer | null }[]> {
  const mailbox = dcMailbox();
  if (!mailbox) return [];
  const page: { value: { "@odata.type": string; name: string; size: number; contentBytes?: string }[] } =
    await graphJson(`users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`);
  return page.value
    .filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && /\.html?$/i.test(a.name))
    .map((a) => ({ name: a.name, bytes: a.size <= MAX_BYTES && a.contentBytes ? Buffer.from(a.contentBytes, "base64") : null }));
}

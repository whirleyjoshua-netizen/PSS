import "server-only";
import { graphJson } from "@/lib/calendar/graph";
import { DC_SENDER, DC_SUBJECT, dcMailbox, ORDER_SENDER, ORDER_SUBJECT, RECEIPT_SUBJECT } from "./config";

/**
 * A Dealer Copy (a quote), DC's receipt for a submitted order, HD's confirmation of that order, or any other mail
 * from HD's order address ("hd-other"), which the owners are told about so a new kind (shipping) can be set up.
 */
export type MailKind = "dealer-copy" | "receipt" | "order" | "hd-other";
export type MailMessage = { id: string; kind: MailKind; internetMessageId: string; subject: string; from: string; receivedAt: Date };
type GraphMessage = { id: string; internetMessageId: string; subject: string | null; receivedDateTime: string; from?: { emailAddress?: { address?: string } } };
const MAX_BYTES = 1_000_000;
/** HD's order PDF is about 200 KB. */
const MAX_PDF_BYTES = 5_000_000;

/** Which DC or HD email this is, by sender and subject together, or null for any other mail. */
export function mailKind(from: string, subject: string): MailKind | null {
  if (from === DC_SENDER && DC_SUBJECT.test(subject)) return "dealer-copy";
  if (from === DC_SENDER && RECEIPT_SUBJECT.test(subject)) return "receipt";
  if (from === ORDER_SENDER && ORDER_SUBJECT.test(subject)) return "order";
  if (from === ORDER_SENDER) return "hd-other";
  return null;
}

/**
 * DC- and HD-shaped messages received since `since`. READ ONLY: this module only ever GETs. The mailbox
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
      const kind = mailKind(from, subject);
      if (!kind) continue;
      found.push({ id: m.id, kind, internetMessageId: m.internetMessageId, subject, from, receivedAt: new Date(m.receivedDateTime) });
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
  return fileAttachments(messageId, /\.html?$/i, MAX_BYTES);
}

/** Every .pdf file attachment, the same way: HD's order confirmation carries one. */
export async function pdfAttachments(messageId: string): Promise<{ name: string; bytes: Buffer | null }[]> {
  return fileAttachments(messageId, /\.pdf$/i, MAX_PDF_BYTES);
}

async function fileAttachments(messageId: string, name: RegExp, maxBytes: number): Promise<{ name: string; bytes: Buffer | null }[]> {
  const mailbox = dcMailbox();
  if (!mailbox) return [];
  const page: { value: { "@odata.type": string; name: string; size: number; contentBytes?: string }[] } =
    await graphJson(`users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`);
  return page.value
    .filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && name.test(a.name))
    .map((a) => ({ name: a.name, bytes: a.size <= maxBytes && a.contentBytes ? Buffer.from(a.contentBytes, "base64") : null }));
}

/** The message's own body as Outlook holds it (HTML for HD's mail), or "" when it has none. */
export async function messageHtml(messageId: string): Promise<string> {
  const mailbox = dcMailbox();
  if (!mailbox) return "";
  const message: { body?: { content?: string } } =
    await graphJson(`users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}?$select=body`);
  return message.body?.content ?? "";
}

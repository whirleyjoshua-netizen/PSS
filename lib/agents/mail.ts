import "server-only";
import { graphFetch } from "@/lib/calendar/graph";
import { calendarConfig } from "@/lib/calendar/config";
import { isOptOut, type AgentItem } from "./rules";
import { addSuppression, claimReplyPoll, insertReply, markFailed, markSent, sentConversations } from "./store";

const MAX_REPLY = 50 * 1024;
const mailboxPath = () => `users/${encodeURIComponent(calendarConfig()?.mailbox ?? "")}`;

function explain(status: number, step: string): string {
  if (status === 403) return "Microsoft refused to send: the app needs the Mail.Send permission (Azure → PSS Job Calendar → API permissions → add Mail.Send (Application) → Grant admin consent).";
  if (status === 401) return "Microsoft sign-in failed: check the Outlook app credentials.";
  return `Microsoft ${step} failed (${status}). Try again in a minute.`;
}

/** Sends one approved email from support@: create a draft (to learn its ids), then send it. */
export async function sendApproved(item: AgentItem, sentBody: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const fail = async (error: string) => { await markFailed(item.id, error); return { ok: false as const, error }; };
  try {
    const draft = await graphFetch(`${mailboxPath()}/messages`, {
      method: "POST",
      body: { subject: item.finalSubject, body: { contentType: "Text", content: sentBody }, toRecipients: [{ emailAddress: { address: item.finalTo } }] },
    });
    if (!draft.ok) return fail(explain(draft.status, "draft"));
    const created = (await draft.json()) as { id: string; conversationId: string; internetMessageId: string };
    const sent = await graphFetch(`${mailboxPath()}/messages/${encodeURIComponent(created.id)}/send`, { method: "POST" });
    if (!sent.ok) return fail(explain(sent.status, "send"));
    await markSent(item.id, { sentBody, graphMessageId: created.id, conversationId: created.conversationId, internetMessageId: created.internetMessageId });
    return { ok: true };
  } catch (error) {
    return fail(`Couldn't reach Microsoft: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    // A <br> right after a closed block adds no extra line (the block already ended one).
    .replace(/(<\/(?:p|div|li|tr|h\d)>)\s*<br\s*\/?>/gi, "$1")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Cuts text to at most `max` UTF-8 bytes. A multibyte character split by the cut is dropped whole
 * (stream mode holds back the incomplete trailing sequence instead of emitting U+FFFD). */
function capBytes(text: string, max: number): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= max) return text;
  return new TextDecoder("utf-8").decode(bytes.subarray(0, max), { stream: true });
}

type GraphBody = { contentType: string; content: string };
type GraphMessage = {
  internetMessageId: string; from?: { emailAddress?: { address?: string } }; receivedDateTime: string; subject: string | null;
  uniqueBody?: GraphBody; body?: GraphBody;
};

/** The reply's own words: `uniqueBody` leaves out the quoted original (and so our opt-out footer). */
function replyText(m: GraphMessage): string {
  const toText = (b: GraphBody | undefined) => {
    const raw = b?.content ?? "";
    return b?.contentType?.toLowerCase() === "html" ? htmlToText(raw) : raw.trim();
  };
  const own = toText(m.uniqueBody);
  return own || toText(m.body);
}

/** READ ONLY. Fetches only messages in conversations an agent email started. Never moves, flags or marks anything. */
export async function pollReplies(options: { force?: boolean } = {}): Promise<{ stored: number }> {
  const mailbox = calendarConfig()?.mailbox?.toLowerCase();
  if (!mailbox) return { stored: 0 };
  if (!options.force && !(await claimReplyPoll())) return { stored: 0 };
  let stored = 0;
  for (const { id, conversationId } of await sentConversations(60)) {
    const filter = encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`);
    const response = await graphFetch(`${mailboxPath()}/messages?$filter=${filter}&$top=50&$select=internetMessageId,from,receivedDateTime,subject,uniqueBody,body`);
    if (!response.ok) continue;
    const { value } = (await response.json()) as { value: GraphMessage[] };
    for (const m of value) {
      const from = m.from?.emailAddress?.address ?? "";
      if (!from || from.toLowerCase() === mailbox) continue;
      const bodyText = capBytes(replyText(m), MAX_REPLY);
      const isNew = await insertReply({ itemId: id, internetMessageId: m.internetMessageId, from, receivedAt: new Date(m.receivedDateTime), subject: m.subject, bodyText });
      if (!isNew) continue;
      stored += 1;
      if (isOptOut(bodyText)) await addSuppression(from, `Replied: ${bodyText.slice(0, 120)}`, "reply");
    }
  }
  return { stored };
}

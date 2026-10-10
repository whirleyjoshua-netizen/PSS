import "server-only";
import { graphFetch } from "@/lib/calendar/graph";
import { calendarConfig } from "@/lib/calendar/config";
import { isOptOut, STUCK_MINUTES, type AgentItem } from "./rules";
import {
  addSuppression, claimReplyPoll, insertReply, markFailed, markSent, releaseReplyPoll, sentConversations, sentWithoutIds,
  setSendingBody, setSentIds, stuckApproved,
} from "./store";

const MAX_REPLY = 50 * 1024;
const mailboxPath = () => `users/${encodeURIComponent(calendarConfig()?.mailbox ?? "")}`;

/**
 * Every agent email carries this MAPI named property, valued with its agent_items id. Exchange keeps it on the saved
 * copy, and Graph can filter on it server side, in every folder, so a moved copy still counts.
 * The GUID is fixed for good: changing it would lose every earlier email.
 */
export const ITEM_PROPERTY_ID = "String {4d8496b0-6227-4862-9069-ff268a2f1b50} Name PssAgentItemId";
/** Clock difference allowed between this server and Exchange when filtering the inbox by time. */
const SKEW_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const PAGE_SIZE = 50;
export const MAX_INBOX_PAGES = 20;
/** Sends settled from Outlook per poll, per kind (stuck mid-send, or sent without ids), oldest first. */
export const MAX_SETTLE_ROWS = 10;

const permission = (name: "Mail.Send" | "Mail.Read") =>
  `the app needs the ${name} permission (Azure → PSS Job Calendar → API permissions → add ${name} (Application) → Grant admin consent).`;
function explainSend(status: number): string {
  if (status === 403) return `Microsoft refused to send, so nothing was sent: ${permission("Mail.Send")}`;
  if (status === 401) return "Microsoft sign-in failed, so nothing was sent: check the Outlook app credentials.";
  return `Microsoft refused the email (${status}), so nothing was sent.`;
}
function explainRead(status: number): string {
  if (status === 403) return `Microsoft refused to read the mailbox: ${permission("Mail.Read")}`;
  if (status === 401) return "Microsoft sign-in failed: check the Outlook app credentials.";
  return status ? `Microsoft couldn't search the mailbox (${status}).` : "Couldn't reach Microsoft to search the mailbox.";
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

type SentCopy = { graphMessageId: string; conversationId: string };
type CopyLookup = { ok: true; copy: SentCopy | null } | { ok: false; status: number };

/** The Graph path that finds an agent email's sent copy, in any folder, by its item property. */
export function copyLookupPath(itemId: string): string {
  const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${ITEM_PROPERTY_ID}' and ep/value eq '${itemId.replace(/'/g, "''")}')`;
  return `${mailboxPath()}/messages?$filter=${encodeURIComponent(filter)}&$select=id,conversationId,sentDateTime,isDraft&$top=5`;
}

/** READ ONLY. One server-side query: the sent (non-draft) copy of this agent email, or null. Never throws. */
export async function findSentCopy(itemId: string): Promise<CopyLookup> {
  try {
    const response = await graphFetch(copyLookupPath(itemId));
    if (!response.ok) return { ok: false, status: response.status };
    const { value } = (await response.json()) as { value: { id: string; conversationId: string; isDraft?: boolean }[] };
    const sent = value.find((m) => m.isDraft !== true);
    return { ok: true, copy: sent ? { graphMessageId: sent.id, conversationId: sent.conversationId } : null };
  } catch {
    return { ok: false, status: 0 };
  }
}

export type SendResult = { ok: true; alreadySent?: boolean } | { ok: false; error: string };

/**
 * Sends one approved email from support@ with a single sendMail (needs only Mail.Send), tagged with ITEM_PROPERTY_ID,
 * then looks up its copy (Mail.Read) for the conversation id replies are matched on. If the copy isn't there yet,
 * the row is still sent, and the reply poll fills the ids in later.
 * 'failed' must mean "certainly not sent", because failed can be retried:
 *  - only a definite refusal (a 4xx other than 429) is failed;
 *  - a timeout, network error, 5xx or 429 is unknown: the row stays 'approved' ("Sending…"), and the reply poll
 *    decides it from Outlook once STUCK_MINUTES have passed since the claim (found = sent, missing = failed);
 *  - a retry looks up the earlier attempt first, and sends only if it isn't there;
 *  - sendMail is never retried automatically.
 */
export async function sendApproved(item: AgentItem, sentBody: string, isRetry = false): Promise<SendResult> {
  const fail = async (error: string): Promise<SendResult> => { await markFailed(item.id, error); return { ok: false, error }; };
  const sent = async (copy: SentCopy | null, alreadySent = false): Promise<SendResult> => {
    // The email is out. A failure to record it must never mark it failed: failed is retryable.
    // The row stays 'approved', which claimForSend won't claim, and the reply poll settles it from Outlook.
    try {
      await markSent(item.id, {
        sentBody: alreadySent ? null : sentBody, graphMessageId: copy?.graphMessageId ?? null,
        conversationId: copy?.conversationId ?? null, internetMessageId: null,
      });
    } catch (error) {
      console.error("Agent email sent but not recorded", item.id, error);
      return { ok: false, error: "The email was sent, but saving that failed. Don't send it again; refresh in a minute." };
    }
    return alreadySent ? { ok: true, alreadySent } : { ok: true };
  };

  if (isRetry) {
    const earlier = await findSentCopy(item.id);
    if (!earlier.ok) return fail(`${explainRead(earlier.status)} An earlier attempt may have gone out, so nothing was sent.`);
    if (earlier.copy) return sent(earlier.copy, true);
  }

  // Written first, so an email that goes out but is never recorded still shows what was sent.
  await setSendingBody(item.id, sentBody);
  // Left 'approved' on purpose: Exchange may still save it, so only the later check can say it wasn't sent.
  const unknown = (reason: string): SendResult => ({
    ok: false,
    error: `${reason} The email may have been sent. The app checks Outlook for it ${STUCK_MINUTES} minutes after you approved it: `
      + "if it's there it's marked sent, otherwise you can retry. Don't resend it yourself.",
  });
  let response: Response;
  try {
    response = await graphFetch(`${mailboxPath()}/sendMail`, {
      method: "POST",
      retry: false,
      body: {
        message: {
          subject: item.finalSubject,
          body: { contentType: "Text", content: sentBody },
          toRecipients: [{ emailAddress: { address: item.finalTo } }],
          singleValueExtendedProperties: [{ id: ITEM_PROPERTY_ID, value: item.id }],
        },
        saveToSentItems: true,
      },
    });
  } catch (error) {
    return unknown(`Microsoft didn't answer (${message(error)}).`);
  }
  if (response.ok) {
    const lookup = await findSentCopy(item.id);
    return sent(lookup.ok ? lookup.copy : null);
  }
  // 429 is treated as unknown: Graph's throttling guidance says to retry, not that the request was never processed.
  if (response.status >= 500 || response.status === 429) return unknown(`Microsoft answered ${response.status}.`);
  return fail(explainSend(response.status));
}

/** Settles agent emails from Outlook, one lookup per row, at most MAX_SETTLE_ROWS of each kind, oldest first:
 * a row still 'approved' STUCK_MINUTES after its claim is sent if its copy is found and failed (retryable) if not,
 * and a sent row without ids gets them. A lookup that fails leaves the row alone. READ ONLY on the mailbox. Never throws. */
async function settleSends(): Promise<void> {
  try {
    const [stuck, unmatched] = await Promise.all([stuckApproved(STUCK_MINUTES, MAX_SETTLE_ROWS), sentWithoutIds(60, MAX_SETTLE_ROWS)]);
    for (const { id } of stuck) {
      const lookup = await findSentCopy(id);
      if (!lookup.ok) continue;
      if (lookup.copy) await markSent(id, { sentBody: null, ...lookup.copy, internetMessageId: null });
      else await markFailed(id, `Not found in Outlook ${STUCK_MINUTES} minutes after it was approved, so it wasn't sent. You can retry.`);
    }
    for (const { id } of unmatched) {
      const lookup = await findSentCopy(id);
      if (lookup.ok && lookup.copy) await setSentIds(id, { ...lookup.copy, internetMessageId: null });
    }
  } catch (error) {
    console.error("Agent send check failed", error);
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


/**
 * READ ONLY: never moves, flags or marks anything. One inbox listing for the window (ids and conversation ids only),
 * matched in memory against the conversations agent emails started. Only matching messages are read in full.
 * The window is max(last poll − 5 minutes, now − 60 days). At most once per 2 minutes unless forced.
 * A poll that fails hands its window back. A poll that hits the page cap moves the mark only to the newest message
 * it actually processed, so the next poll carries on from there.
 */
export async function pollReplies(options: { force?: boolean } = {}): Promise<{ stored: number }> {
  const mailbox = calendarConfig()?.mailbox?.toLowerCase();
  if (!mailbox) return { stored: 0 };
  const claim = await claimReplyPoll(Boolean(options.force));
  if (!claim) return { stored: 0 };
  await settleSends();
  const conversations = new Map((await sentConversations(60)).map((c) => [c.conversationId, c.id]));
  if (conversations.size === 0) return { stored: 0 };
  const floor = Date.now() - 60 * DAY_MS;
  const since = new Date(Math.max(floor, (claim.previous?.getTime() ?? floor) - SKEW_MS));
  let stored = 0;
  let through: Date | null = null;
  try {
    const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
    let next: string | undefined =
      `${mailboxPath()}/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime asc&$top=${PAGE_SIZE}` +
      "&$select=id,conversationId,receivedDateTime";
    for (let page = 0; next; page++) {
      if (page === MAX_INBOX_PAGES) {
        // Capped: the next poll starts from the newest message this one processed.
        if (through) await releaseReplyPoll(claim.claimedAt, through);
        break;
      }
      const response = await graphFetch(next);
      if (!response.ok) throw new Error(`Microsoft inbox listing failed (${response.status})`);
      const body = (await response.json()) as { value: { id: string; conversationId: string; receivedDateTime: string }[]; "@odata.nextLink"?: string };
      for (const listed of body.value) {
        const itemId = conversations.get(listed.conversationId);
        if (itemId) {
          const full = await graphFetch(
            `${mailboxPath()}/messages/${encodeURIComponent(listed.id)}?$select=internetMessageId,from,receivedDateTime,subject,uniqueBody,body`,
          );
          if (!full.ok) throw new Error(`Microsoft message read failed (${full.status})`);
          const m = (await full.json()) as GraphMessage;
          const from = m.from?.emailAddress?.address ?? "";
          if (from && from.toLowerCase() !== mailbox) {
            const bodyText = capBytes(replyText(m), MAX_REPLY);
            const isNew = await insertReply({ itemId, internetMessageId: m.internetMessageId, from, receivedAt: new Date(m.receivedDateTime), subject: m.subject, bodyText });
            if (isNew) {
              stored += 1;
              if (isOptOut(bodyText)) await addSuppression(from, `Replied: ${bodyText.slice(0, 120)}`, "reply");
            }
          }
        }
        // Only after the message is fully handled does it count as processed.
        through = new Date(listed.receivedDateTime);
      }
      next = body["@odata.nextLink"];
    }
  } catch (error) {
    await releaseReplyPoll(claim.claimedAt, claim.previous).catch(() => {});
    throw error;
  }
  return { stored };
}

import "server-only";
import { graphFetch } from "@/lib/calendar/graph";
import { calendarConfig } from "@/lib/calendar/config";
import { isOptOut, type AgentItem } from "./rules";
import {
  addSuppression, claimReplyPoll, insertReply, markFailed, markSent, releaseReplyPoll, sentConversations, sentWithoutIds,
  setSendingBody, setSentIds, stuckApproved,
} from "./store";

const MAX_REPLY = 50 * 1024;
const mailboxPath = () => `users/${encodeURIComponent(calendarConfig()?.mailbox ?? "")}`;

/** Every agent email carries this header with its agent_items id, so its copy in Sent Items can be found. */
export const ITEM_HEADER = "X-PSS-Agent-Item";
/** Clock difference allowed between this server and Exchange when filtering by time. */
const SKEW_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const PAGE_SIZE = 50;
const MAX_SENT_PAGES = 10;
const MAX_INBOX_PAGES = 20;
/** An email still 'approved' this long after its claim is settled from Sent Items: found = sent, missing = failed. */
export const STUCK_MINUTES = 15;

const permission = (name: "Mail.Send" | "Mail.Read") =>
  `the app needs the ${name} permission (Azure → PSS Job Calendar → API permissions → add ${name} (Application) → Grant admin consent).`;
function explainSend(status: number): string {
  if (status === 403) return `Microsoft refused to send: ${permission("Mail.Send")}`;
  if (status === 401) return "Microsoft sign-in failed: check the Outlook app credentials.";
  if (status === 429) return "Microsoft is busy (too many requests), so nothing was sent. Try again in a minute.";
  return `Microsoft refused the email (${status}), so nothing was sent. Try again in a minute.`;
}
function explainRead(status: number): string {
  if (status === 403) return `Microsoft refused to read Sent Items: ${permission("Mail.Read")}`;
  if (status === 401) return "Microsoft sign-in failed: check the Outlook app credentials.";
  return status ? `Microsoft couldn't list Sent Items (${status}).` : "Couldn't reach Microsoft to check Sent Items.";
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

type SentCopy = { graphMessageId: string; conversationId: string; internetMessageId: string | null };
type SentLookup = { ok: true; found: Map<string, SentCopy>; complete: boolean } | { ok: false; status: number };

/** READ ONLY. Finds agent emails in Sent Items by their X-PSS-Agent-Item header, newest first, sent at or after `since`.
 * `complete` is false when the page cap stopped the search early, so "not found" is then no proof. Never throws. */
export async function findSentCopies(itemIds: string[], since: Date): Promise<SentLookup> {
  const wanted = new Set(itemIds);
  const found = new Map<string, SentCopy>();
  const filter = encodeURIComponent(`sentDateTime ge ${since.toISOString()}`);
  let next: string | undefined =
    `${mailboxPath()}/mailFolders/sentitems/messages?$filter=${filter}&$orderby=sentDateTime desc&$top=${PAGE_SIZE}` +
    "&$select=id,conversationId,internetMessageId,internetMessageHeaders";
  try {
    for (let page = 0; next && page < MAX_SENT_PAGES && found.size < wanted.size; page++) {
      const response = await graphFetch(next);
      if (!response.ok) return { ok: false, status: response.status };
      const body = (await response.json()) as {
        value: { id: string; conversationId: string; internetMessageId?: string; internetMessageHeaders?: { name: string; value: string }[] }[];
        "@odata.nextLink"?: string;
      };
      for (const m of body.value) {
        const header = m.internetMessageHeaders?.find((h) => h.name.toLowerCase() === ITEM_HEADER.toLowerCase());
        const itemId = header?.value.trim();
        if (itemId && wanted.has(itemId) && !found.has(itemId)) {
          found.set(itemId, { graphMessageId: m.id, conversationId: m.conversationId, internetMessageId: m.internetMessageId ?? null });
        }
      }
      next = body["@odata.nextLink"];
    }
  } catch {
    return { ok: false, status: 0 };
  }
  return { ok: true, found, complete: !next || found.size === wanted.size };
}

export type SendResult = { ok: true; alreadySent?: boolean } | { ok: false; error: string };

/**
 * Sends one approved email from support@ with a single sendMail (needs only Mail.Send), then finds its Sent Items
 * copy (Mail.Read) to learn the conversation id replies are matched on. If that copy isn't there yet, the row is
 * still sent, and the reply poll fills the ids in later.
 * 'failed' must mean "certainly not sent", because failed can be retried:
 *  - a retry (earlierAttemptAt set) looks in Sent Items first, and sends only if the earlier attempt isn't there;
 *  - sendMail is never retried automatically, and a timeout, network error or 5xx is checked against Sent Items.
 */
export async function sendApproved(item: AgentItem, sentBody: string, earlierAttemptAt: Date | null = null): Promise<SendResult> {
  const fail = async (error: string): Promise<SendResult> => { await markFailed(item.id, error); return { ok: false, error }; };
  const sent = async (copy: SentCopy | undefined, alreadySent = false): Promise<SendResult> => {
    // The email is out. A failure to record it must never mark it failed: failed is retryable.
    // The row stays 'approved', which claimForSend won't claim, and the reply poll settles it from Sent Items.
    try {
      await markSent(item.id, {
        sentBody: alreadySent ? null : sentBody, graphMessageId: copy?.graphMessageId ?? null,
        conversationId: copy?.conversationId ?? null, internetMessageId: copy?.internetMessageId ?? null,
      });
    } catch (error) {
      console.error("Agent email sent but not recorded", item.id, error);
      return { ok: false, error: "The email was sent, but saving that failed. Don't send it again; refresh in a minute." };
    }
    return alreadySent ? { ok: true, alreadySent } : { ok: true };
  };

  if (earlierAttemptAt) {
    const earlier = await findSentCopies([item.id], new Date(earlierAttemptAt.getTime() - SKEW_MS));
    if (!earlier.ok) return fail(`${explainRead(earlier.status)} An earlier attempt may have gone out, so nothing was sent.`);
    const copy = earlier.found.get(item.id);
    if (copy) return sent(copy, true);
    if (!earlier.complete) return fail("Sent Items has too many emails to check for the earlier attempt, so nothing was sent. Check Sent Items in Outlook.");
  }

  // Written first, so an email that goes out but is never recorded still shows what was sent.
  await setSendingBody(item.id, sentBody);
  const start = new Date(Date.now() - SKEW_MS);
  const unknown = async (reason: string): Promise<SendResult> => {
    const lookup = await findSentCopies([item.id], start);
    const copy = lookup.ok ? lookup.found.get(item.id) : undefined;
    if (copy) return sent(copy);
    if (lookup.ok && lookup.complete) return fail(`${reason} It isn't in Sent Items, so it wasn't sent. You can retry.`);
    return fail(`${reason} It may have been sent: check Sent Items in Outlook. Retry checks Sent Items first and won't send it twice.`);
  };
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
          internetMessageHeaders: [{ name: ITEM_HEADER, value: item.id }],
        },
        saveToSentItems: true,
      },
    });
  } catch (error) {
    return unknown(`Microsoft didn't answer (${message(error)}).`);
  }
  if (response.ok) {
    const lookup = await findSentCopies([item.id], start);
    return sent(lookup.ok ? lookup.found.get(item.id) : undefined);
  }
  if (response.status >= 500) return unknown(`Microsoft answered ${response.status}.`);
  return fail(explainSend(response.status));
}

/** Settles agent emails from Sent Items: fills in ids for sent rows recorded without them, and decides rows stuck in
 * 'approved' (found = sent, certainly missing = failed and retryable). READ ONLY on the mailbox. Never throws.
 * Answers the oldest send time among those rows, so this poll reads the inbox back to then: replies to them
 * couldn't be matched while their conversation ids were unknown. */
async function settleFromSentItems(): Promise<Date | null> {
  let oldestUnmatched: Date | null = null;
  try {
    const [unmatched, stuck] = await Promise.all([sentWithoutIds(60), stuckApproved(STUCK_MINUTES)]);
    if (unmatched.length === 0 && stuck.length === 0) return null;
    const times = [...unmatched.map((u) => u.sentAt.getTime()), ...stuck.map((s) => s.claimedAt.getTime())];
    oldestUnmatched = new Date(Math.min(...times));
    const since = new Date(Math.max(Math.min(...times) - SKEW_MS, Date.now() - 61 * DAY_MS));
    const lookup = await findSentCopies([...unmatched.map((u) => u.id), ...stuck.map((s) => s.id)], since);
    if (!lookup.ok) return oldestUnmatched;
    for (const { id } of unmatched) {
      const copy = lookup.found.get(id);
      if (copy) await setSentIds(id, copy);
    }
    for (const { id } of stuck) {
      const copy = lookup.found.get(id);
      if (copy) await markSent(id, { sentBody: null, ...copy });
      else if (lookup.complete) await markFailed(id, "This email's send never finished and it isn't in Sent Items, so it wasn't sent. You can retry.");
    }
  } catch (error) {
    console.error("Agent Sent Items check failed", error);
  }
  return oldestUnmatched;
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
 * READ ONLY: never moves, flags or marks anything. One inbox listing since just before the last poll (ids and
 * conversation ids only), matched in memory against the conversations agent emails started. Only the matching
 * messages are read in full, so nothing else in the inbox is read.
 * At most once per 2 minutes unless forced. A poll that fails hands its window back, so the next poll covers it.
 */
export async function pollReplies(options: { force?: boolean } = {}): Promise<{ stored: number }> {
  const mailbox = calendarConfig()?.mailbox?.toLowerCase();
  if (!mailbox) return { stored: 0 };
  const claim = await claimReplyPoll(Boolean(options.force));
  if (!claim) return { stored: 0 };
  const oldestUnmatched = await settleFromSentItems();
  const conversations = new Map((await sentConversations(60)).map((c) => [c.conversationId, c.id]));
  if (conversations.size === 0) return { stored: 0 };
  const floor = Date.now() - 60 * DAY_MS;
  const from = Math.min(claim.previous?.getTime() ?? floor, oldestUnmatched?.getTime() ?? Infinity);
  const since = new Date(Math.max(floor, from - SKEW_MS));
  let stored = 0;
  let through: Date | null = null;
  try {
    const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
    let next: string | undefined =
      `${mailboxPath()}/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime asc&$top=${PAGE_SIZE}` +
      "&$select=id,conversationId,receivedDateTime";
    for (let page = 0; next; page++) {
      if (page === MAX_INBOX_PAGES) {
        // Capped: the next poll starts where this one stopped.
        if (through) await releaseReplyPoll(claim.claimedAt, new Date(through.getTime() + SKEW_MS));
        break;
      }
      const response = await graphFetch(next);
      if (!response.ok) throw new Error(`Microsoft inbox listing failed (${response.status})`);
      const body = (await response.json()) as { value: { id: string; conversationId: string; receivedDateTime: string }[]; "@odata.nextLink"?: string };
      for (const listed of body.value) {
        through = new Date(listed.receivedDateTime);
        const itemId = conversations.get(listed.conversationId);
        if (!itemId) continue;
        const full = await graphFetch(
          `${mailboxPath()}/messages/${encodeURIComponent(listed.id)}?$select=internetMessageId,from,receivedDateTime,subject,uniqueBody,body`,
        );
        if (!full.ok) throw new Error(`Microsoft message read failed (${full.status})`);
        const m = (await full.json()) as GraphMessage;
        const from = m.from?.emailAddress?.address ?? "";
        if (!from || from.toLowerCase() === mailbox) continue;
        const bodyText = capBytes(replyText(m), MAX_REPLY);
        const isNew = await insertReply({ itemId, internetMessageId: m.internetMessageId, from, receivedAt: new Date(m.receivedDateTime), subject: m.subject, bodyText });
        if (!isNew) continue;
        stored += 1;
        if (isOptOut(bodyText)) await addSuppression(from, `Replied: ${bodyText.slice(0, 120)}`, "reply");
      }
      next = body["@odata.nextLink"];
    }
  } catch (error) {
    await releaseReplyPoll(claim.claimedAt, claim.previous).catch(() => {});
    throw error;
  }
  return { stored };
}

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { business } from "@/content/business";

export const ITEM_KINDS = ["report", "email", "decision"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const REPORT_TYPES = ["daily", "weekly", "monthly", "brief", "other"] as const;
export type ItemStatus = "unread" | "read" | "pending" | "approved" | "sent" | "failed" | "declined" | "answered";
export type AgentItem = {
  id: string; agentSlug: string; externalId: string; kind: ItemKind; title: string; summary: string | null;
  reportType: string | null; bodyMd: string | null; emailTo: string | null; emailSubject: string | null; emailBody: string | null;
  reason: string | null; status: ItemStatus; ownerNote: string | null;
  finalTo: string | null; finalSubject: string | null; finalBody: string | null; sentBody: string | null;
  decidedBy: string | null; decidedAt: Date | null; sentAt: Date | null; conversationId: string | null; error: string | null;
  createdAt: Date; updatedAt: Date;
};
export type Agent = {
  slug: string; name: string; role: string; hasKey: boolean; statsAccess: boolean; dailySendCap: number;
  lastRunAt: Date | null; lastRunStatus: "ok" | "failed" | null; lastRunNote: string | null;
};

export const MAX_ITEMS_PER_PUSH = 50;
export const MAX_BODY_BYTES = 204_800;
const MAX_EMAIL_BODY = 20_000;

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");
export const newAgentKey = (): string => randomBytes(32).toString("base64url");
export function bearerKey(header: string | null): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(header?.trim() ?? "");
  return match ? match[1] : null;
}
export const normalizeAddress = (address: string): string => address.trim().toLowerCase();

const sized = z.string().refine((s) => Buffer.byteLength(s, "utf8") <= MAX_BODY_BYTES, "body_md is too large (200 KB max)");
const common = {
  external_id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/, "external_id: 1-100 letters, digits, dot, dash or underscore"),
  title: z.string().trim().min(1, "title is required").max(200),
  summary: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(2000).optional(),
};
const itemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report"), ...common, report_type: z.enum(REPORT_TYPES), body_md: sized.pipe(z.string().min(1, "body_md is required")) }),
  z.object({
    kind: z.literal("email"), ...common,
    email_to: z.string().transform(normalizeAddress).pipe(z.email("email_to must be one email address")),
    email_subject: z.string().trim().min(1).max(200),
    email_body: z.string().trim().min(1).max(MAX_EMAIL_BODY),
  }),
  z.object({ kind: z.literal("decision"), ...common, body_md: sized.optional() }),
]);
export type PushItem = z.infer<typeof itemSchema>;

export function parsePushItem(raw: unknown): { ok: true; item: PushItem } | { ok: false; reason: string } {
  const parsed = itemSchema.safeParse(raw);
  return parsed.success ? { ok: true, item: parsed.data } : { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
}

/** Items are checked one by one (parsePushItem), so one bad item doesn't sink the rest. */
export const pushSchema = z.object({
  run: z.object({ status: z.enum(["ok", "failed"]), note: z.string().trim().max(500).optional() }).optional(),
  items: z.array(z.unknown()).max(MAX_ITEMS_PER_PUSH).default([]),
});

export const OPT_OUT_LINE = `If you'd rather not hear from us, just reply "no thanks".`;
const OPT_OUT = /\b(no thanks|unsubscribe|remove me|stop emailing|stop contacting|stop sending)\b/i;
const QUOTE_START = /^(-----Original Message-----|On .+ wrote:$|From: )/;

/** A signature starts at a line that is just "--" or "-- ". */
const SIGNATURE_START = /^-- ?$/;
const SENT_FROM = /^\s*sent from my\b/i;
const MAX_STOP_WORDS = 4;

/** The reply's own words: every email we send ends with OPT_OUT_LINE ("reply \"no thanks\""), and most mail
 * clients quote the original in a reply, so quoted text and our footer are removed before matching. Otherwise
 * almost every reply would read as an opt-out. A signature block and "Sent from my iPhone" lines go too. */
function ownWords(text: string): string {
  const own: string[] = [];
  for (const line of text.split(OPT_OUT_LINE).join("").split(/\r?\n/)) {
    if (QUOTE_START.test(line.trim()) || SIGNATURE_START.test(line)) break;
    if (/^\s*>/.test(line) || SENT_FROM.test(line)) continue;
    own.push(line);
  }
  return own.join("\n");
}

/** True when the reply asks us to stop. A short reply (4 words or fewer) containing the word "stop" counts:
 * over-suppressing costs less than emailing someone who said stop, and the owner can remove an entry. */
export function isOptOut(text: string): boolean {
  const own = ownWords(text);
  if (OPT_OUT.test(own)) return true;
  const words = own.trim().split(/\s+/).filter(Boolean);
  return words.length <= MAX_STOP_WORDS && /\bstop\b/i.test(own);
}

export const defaultSignature = (): string =>
  [business.name, business.phone.display, business.domain.replace(/^https?:\/\//, "")].join("\n");

export const composeEmailBody = (body: string, signature: string, mailingAddress: string): string =>
  `${body.trim()}\n\n--\n${signature.trim()}\n${mailingAddress.trim()}\n\n${OPT_OUT_LINE}`;
/** Exactly what composeEmailBody adds after the body: shown under every email card, and checked again at send. */
export const emailFooter = (signature: string, mailingAddress: string): string =>
  composeEmailBody("", signature, mailingAddress).trimStart();
/** The same text, however the browser posted its line breaks. */
export const sameText = (a: string, b: string): boolean => a.replace(/\r\n?/g, "\n").trim() === b.replace(/\r\n?/g, "\n").trim();

export function sendBlocker(input: {
  outlookConfigured: boolean; mailingAddress: string | null; suppressed: boolean; sentToday: number; cap: number;
}): string | null {
  if (!input.outlookConfigured) return "Outlook is not connected, so the app can't send email.";
  if (!input.mailingAddress?.trim()) return "Add a mailing address in Settings → Agents first. Outreach email must include one.";
  if (input.suppressed) return "This address is on the do-not-contact list.";
  if (input.sentToday >= input.cap) return `This agent has sent ${input.cap} emails today, its daily limit.`;
  return null;
}

export const agentFormSchema = z.object({
  slug: z.string().trim().regex(/^[a-z][a-z0-9-]{1,30}$/, "Slug: lower-case letters, digits and dashes, starting with a letter"),
  name: z.string().trim().min(1, "Name the agent").max(60),
  role: z.string().trim().max(120).default(""),
  statsAccess: z.boolean(),
  dailySendCap: z.coerce.number().int().min(0).max(50),
});
export const emailEditSchema = z.object({
  to: z.string().transform(normalizeAddress).pipe(z.email("One email address")),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(MAX_EMAIL_BODY),
});
export const settingsSchema = z.object({
  mailingAddress: z.string().trim().max(300),
  signature: z.string().trim().max(500),
});

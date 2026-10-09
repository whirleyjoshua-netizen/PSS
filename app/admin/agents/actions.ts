"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { isUuid } from "@/lib/admin/ids";
import { calendarEnabled } from "@/lib/calendar/config";
import { lasVegasDate } from "@/lib/admin/time";
import { composeEmailBody, defaultSignature, emailEditSchema, sendBlocker } from "@/lib/agents/rules";
import {
  claimForSend, decideItem, getAgent, getAgentSettings, getItem, isSuppressed, markFailed, saveEmailEdits, sentTodayCount,
} from "@/lib/agents/store";
import { pollReplies, sendApproved } from "@/lib/agents/mail";

export type CardState = { error?: string; ok?: string };

// Each action calls requireAdmin() first, then checks the id: store functions bind ids raw, so a malformed id would 500.
const NO_ITEM: CardState = { error: "That item no longer exists." };
const refresh = () => {
  revalidatePath("/admin/agents");
  revalidatePath("/admin/agents/[slug]", "page");
  // The admin nav shows the needs-you count.
  revalidatePath("/admin", "layout");
};
const note = (form: FormData) => String(form.get("note") ?? "").trim().slice(0, 2000) || null;
const edits = (form: FormData) => emailEditSchema.safeParse({ to: form.get("to"), subject: form.get("subject"), body: form.get("body") });

export async function saveEdits(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  await requireAdmin();
  if (!isUuid(id)) return NO_ITEM;
  const parsed = edits(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await saveEmailEdits(id, parsed.data))) return { error: "This email was already decided." };
  refresh();
  return { ok: "Edits saved." };
}

/** Checks every blocker, saves what's on screen, claims the row (so a second click can't send twice), then sends. */
export async function approveAndSend(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return NO_ITEM;
  const parsed = edits(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const item = await getItem(id);
  if (!item || item.kind !== "email") return { error: "That email no longer exists." };
  const [agent, settings, suppressed, sentToday] = await Promise.all([
    getAgent(item.agentSlug), getAgentSettings(), isSuppressed(parsed.data.to),
    sentTodayCount(item.agentSlug, lasVegasDate(new Date())),
  ]);
  const blocker = sendBlocker({
    outlookConfigured: calendarEnabled(), mailingAddress: settings.mailingAddress, suppressed,
    sentToday, cap: agent?.dailySendCap ?? 0,
  });
  if (blocker) return { error: blocker };
  if (!(await saveEmailEdits(id, parsed.data))) return { error: "This email was already sent or decided." };
  const claimed = await claimForSend(id, admin.email);
  if (!claimed) return { error: "This email was already sent or decided." };
  // Save and claim are two writes: another admin's edit can land between them. Never send text this owner didn't see.
  if (claimed.finalTo !== parsed.data.to || claimed.finalSubject !== parsed.data.subject || claimed.finalBody !== parsed.data.body) {
    const changed = "The email changed while you were approving it. Review it and approve again.";
    await markFailed(id, changed);
    refresh();
    return { error: changed };
  }
  const sentBody = composeEmailBody(claimed.finalBody ?? "", settings.signature ?? defaultSignature(), settings.mailingAddress ?? "");
  const result = await sendApproved(claimed, sentBody);
  refresh();
  // A failure here may be "sent, but saving that failed": shown unchanged so the owner doesn't send it again.
  return result.ok ? { ok: "Sent." } : { error: result.error };
}

export async function declineItem(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return NO_ITEM;
  if (!(await decideItem(id, { status: "declined", note: note(form), by: admin.email }))) return { error: "Already decided." };
  refresh();
  return { ok: "Declined." };
}

const choice = z.enum(["approved", "declined", "answered"]);
export async function decide(id: string, _prev: CardState, form: FormData): Promise<CardState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return NO_ITEM;
  const picked = choice.safeParse(form.get("choice"));
  if (!picked.success) return { error: "Pick Approve, Decline or Reply." };
  const text = note(form);
  if (picked.data === "answered" && !text) return { error: "Write a reply first." };
  // decideItem only applies approved/answered to decisions, so an email can't be "approved" without being sent.
  if (!(await decideItem(id, { status: picked.data, note: text, by: admin.email }))) return { error: "Already decided." };
  refresh();
  return { ok: "Saved." };
}

export async function refreshReplies(): Promise<void> {
  await requireAdmin();
  try {
    await pollReplies({ force: true });
  } catch (error) {
    console.error("Agent reply refresh failed", error);
  }
  refresh();
}

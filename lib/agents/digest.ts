import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { ownerRecipients } from "@/lib/leads/email";
import { adminOrigin } from "@/lib/admin/origin";
import { formatDay } from "@/lib/admin/time";
import { digestFacts, getAgentSettings, setDigestAt, type DigestFacts } from "./store";

const STALE_MS = 26 * 60 * 60_000;
const isWeekday = (date: Date) =>
  !["Sat", "Sun"].includes(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short" }).format(date));

/** Agents run every weekday morning, so on a weekday each should have run in the last 26 hours. */
function silentAgents(f: DigestFacts, now: Date): string[] {
  if (!isWeekday(now)) return [];
  return f.agentRuns
    .filter((a) => !a.lastRunAt || now.getTime() - a.lastRunAt.getTime() > STALE_MS)
    .map((a) => a.lastRunAt
      ? `⚠ ${a.agentName} hasn't run since ${formatDay(a.lastRunAt)} — is the PC on?`
      : `⚠ ${a.agentName} hasn't run yet — is the PC on?`);
}

export function digestEmail(f: DigestFacts, now: Date): { subject: string; text: string } | null {
  const silent = silentAgents(f, now);
  if (f.newReports.length === 0 && f.pending === 0 && f.newReplies === 0 && f.failedRuns.length === 0 && silent.length === 0) return null;
  const lines = f.newReports.map((r) => `${r.agentName}: ${r.title}`);
  if (lines.length) lines.push("");
  lines.push(`${f.pending} item${f.pending === 1 ? "" : "s"} need${f.pending === 1 ? "s" : ""} you · ${f.newReplies} new repl${f.newReplies === 1 ? "y" : "ies"}`);
  for (const run of f.failedRuns) lines.push(`⚠ ${run.agentName}'s run failed${run.note ? `: ${run.note}` : ""}`);
  lines.push(...silent);
  lines.push("", `Open the dashboard: ${adminOrigin()}/admin/agents`);
  return { subject: `Agents for ${formatDay(now)}: ${f.pending} need you`, text: lines.join("\n") };
}

/** Run by the weekday cron. Never throws. Only moves last_digest_at after a successful send. */
export async function sendAgentDigest(now: Date = new Date()): Promise<{ sent: number; error?: string }> {
  try {
    const { lastDigestAt } = await getAgentSettings();
    const email = digestEmail(await digestFacts(lastDigestAt), now);
    if (!email) return { sent: 0 };
    const apiKey = process.env.RESEND_API_KEY;
    const to = ownerRecipients();
    if (!apiKey || to.length === 0) return { sent: 0, error: "Resend or owner recipients not configured" };
    const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
    const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text });
    if (error) return { sent: 0, error: error.message };
    await setDigestAt(now);
    return { sent: to.length };
  } catch (error) {
    return { sent: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

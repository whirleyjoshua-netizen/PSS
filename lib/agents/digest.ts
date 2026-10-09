import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { ownerRecipients } from "@/lib/leads/email";
import { adminOrigin } from "@/lib/admin/origin";
import { formatDay } from "@/lib/admin/time";
import { digestFacts, getAgentSettings, setDigestAt, type DigestFacts } from "./store";

export function digestEmail(f: DigestFacts, now: Date): { subject: string; text: string } | null {
  if (f.newReports.length === 0 && f.pending === 0 && f.newReplies === 0 && f.failedRuns.length === 0) return null;
  const lines = f.newReports.map((r) => `${r.agentName}: ${r.title}`);
  if (lines.length) lines.push("");
  lines.push(`${f.pending} item${f.pending === 1 ? "" : "s"} need${f.pending === 1 ? "s" : ""} you · ${f.newReplies} new repl${f.newReplies === 1 ? "y" : "ies"}`);
  for (const run of f.failedRuns) lines.push(`⚠ ${run.agentName}'s run failed${run.note ? `: ${run.note}` : ""}`);
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

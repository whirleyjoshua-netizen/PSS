import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { formatPhone } from "@/lib/leads/schema";
import { ownerRecipients } from "@/lib/leads/email";
import { adminOrigin } from "./origin";
import { formatFollowUp } from "./follow-up";
import { listDueFollowUps } from "./follow-ups";
import type { Job } from "./jobs";
import { formatDay } from "./time";

function block(title: string, jobs: Job[]): string[] {
  if (jobs.length === 0) return [];
  return [
    title,
    ...jobs.flatMap((job) => [
      `- ${job.name} · ${formatFollowUp(job.followUpAt as Date, job.followUpNote ?? null)}`,
      `  ${formatPhone(job.phone)} · Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
    ]),
  ];
}

/** The morning digest, or null when nothing is due. Overdue first, then today. */
export function followUpEmail(jobs: Job[], now: Date): { subject: string; text: string } | null {
  const due = jobs.filter((job) => job.followUpAt);
  if (due.length === 0) return null;
  const overdue = due.filter((job) => (job.followUpAt as Date).getTime() < now.getTime());
  const today = due.filter((job) => (job.followUpAt as Date).getTime() >= now.getTime());
  const sections = [block("Overdue", overdue), block("Today", today)].filter((lines) => lines.length);
  return {
    subject: `Call-backs for ${formatDay(now)}: ${due.length}`,
    text: sections.map((lines) => lines.join("\n")).join("\n\n"),
  };
}

/** Run by the daily cron. Never throws; an error comes back for the route to report. */
export async function sendFollowUpDigest(now: Date = new Date()): Promise<{ sent: number; error?: string }> {
  try {
    const email = followUpEmail(await listDueFollowUps(now), now);
    if (!email) return { sent: 0 };
    const apiKey = process.env.RESEND_API_KEY;
    const to = ownerRecipients();
    if (!apiKey || to.length === 0) return { sent: 0, error: "Follow-up email is not configured" };
    const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
    const { error } = await new Resend(apiKey).emails.send({
      from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text,
    });
    if (error) return { sent: 0, error: `Resend rejected the follow-up email: ${error.message}` };
    return { sent: to.length };
  } catch (error) {
    console.error("Follow-up digest failed", error);
    return { sent: 0, error: (error as Error).message };
  }
}

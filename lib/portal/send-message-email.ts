import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { ownerRecipients } from "@/lib/leads/email";
import { formatProjectNo } from "./project-no";

/** Only the fields the email needs, so a full Job satisfies it structurally. */
type MessagedJob = { id: string; name: string; projectNo?: number | null };

/**
 * Tells the owners a customer wrote in from their project page.
 *
 * Plain text for the same reasons as the lead notification, and replyTo is the address the
 * customer is actually signed in as, so hitting Reply reaches the person who wrote.
 *
 * Always called after the job event has been written: this may fail without losing anything.
 */
export async function notifyOwnersOfMessage(
  job: MessagedJob,
  body: string,
  replyTo: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Message notification email is not configured");
  }

  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    `${job.name} sent a message from their project page.`,
    projectNo ? `Project: ${projectNo}` : null,
    `Reply to: ${replyTo}`,
    `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
    "",
    "Message:",
    body.trim(),
  ].filter((line): line is string => line !== null).join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo,
    subject: `Message from ${job.name}${projectNo ? ` — ${projectNo}` : ""}`,
    text,
  });

  // Resend reports failures in the response body rather than by throwing.
  if (error) {
    throw new Error(`Resend rejected the message notification: ${error.message}`);
  }
}

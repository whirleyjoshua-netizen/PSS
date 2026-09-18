import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { formatShortDate, formatTime } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import { formatProjectNo } from "./project-no";

/** Only the fields the email needs, so a full Job satisfies it structurally. */
type AcknowledgedJob = { id: string; name: string; projectNo?: number | null };

/**
 * Tells the owners a customer confirmed their installation is right.
 *
 * This is the happy end of a job: it closes the work, so the email says who confirmed it and
 * when, and states plainly that the job has moved to Completed — an owner who sees the job
 * move on the board should be able to find the reason in their inbox rather than guess it.
 *
 * Plain text for the same reasons as the lead notification, and replyTo is the address the
 * customer is actually signed in as, so hitting Reply reaches the person who confirmed.
 *
 * Always called after the job has already moved: this may fail without losing the move.
 */
export async function notifyOwnersOfAcknowledgement(
  job: AcknowledgedJob,
  confirmedBy: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Acknowledgement notification email is not configured");
  }

  const now = new Date();
  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    `${job.name} confirmed their installation is right, from their project page.`,
    "",
    `Confirmed by: ${confirmedBy}`,
    // The time, not only the day. Both formatters are Las Vegas time, so the two halves
    // cannot disagree about which day it is.
    `When:         ${formatShortDate(now)} at ${formatTime(now)}`,
    projectNo ? `Project:      ${projectNo}` : null,
    "",
    "The job has moved to Completed.",
    `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: confirmedBy,
    subject: `Installation confirmed by ${job.name}${projectNo ? ` — ${projectNo}` : ""}`,
    text,
  });

  // Resend reports failures in the response body rather than by throwing.
  if (error) {
    throw new Error(`Resend rejected the acknowledgement notification: ${error.message}`);
  }
}

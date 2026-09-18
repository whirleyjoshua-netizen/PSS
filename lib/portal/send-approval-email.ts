import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { formatShortDate } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import { formatProjectNo } from "./project-no";

/** Only the fields the email needs, so a full Job satisfies it structurally. */
type ApprovedJob = { id: string; name: string; projectNo?: number | null };

/**
 * Tells the owners a customer approved their quote.
 *
 * This is the most consequential thing a customer can do here — the owners order materials
 * against it — so the email says all four things they will want in six months: who approved,
 * which document, when, and where to open the job.
 *
 * Plain text for the same reasons as the lead notification, and replyTo is the address the
 * customer is actually signed in as, so hitting Reply reaches the person who approved.
 *
 * Always called after the job has already moved: this may fail without losing the approval.
 */
export async function notifyOwnersOfApproval(
  job: ApprovedJob,
  quoteName: string,
  approvedBy: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Approval notification email is not configured");
  }

  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    `${job.name} approved their quote from their project page.`,
    "",
    `Approved by: ${approvedBy}`,
    `Document:    ${quoteName}`,
    `When:        ${formatShortDate(new Date())}`,
    projectNo ? `Project:     ${projectNo}` : null,
    "",
    "The job has moved to Sold.",
    `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
  ].filter((line): line is string => line !== null).join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: approvedBy,
    subject: `Quote approved by ${job.name}${projectNo ? ` — ${projectNo}` : ""}`,
    text,
  });

  // Resend reports failures in the response body rather than by throwing.
  if (error) {
    throw new Error(`Resend rejected the approval notification: ${error.message}`);
  }
}

import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { formatShortDate, formatTime } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import { formatProjectNo } from "./project-no";

/** Only the fields the email needs, so a full Job satisfies it structurally. */
type ApprovedJob = { id: string; name: string; projectNo?: number | null };

/** What happened after the approval, so the owners know whether anything is left for them to do. */
export type ApprovalOutcome = "paperwork" | "contract-sent" | "contract-failed";

const SUBJECT: Record<ApprovalOutcome, string> = {
  paperwork: "Quote approved by",
  "contract-sent": "Quote approved — contract sent —",
  "contract-failed": "Quote approved — contract not sent —",
};
const NEXT: Record<ApprovalOutcome, string> = {
  paperwork: "The job has moved to Approved. Send the paperwork from the job page.",
  "contract-sent": "The job has moved to Approved and the contract was sent to the client to sign.",
  "contract-failed": "The job has moved to Approved, but the contract was NOT sent. Open the Quote tab and press Send contract.",
};

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
  outcome: ApprovalOutcome = "paperwork",
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Approval notification email is not configured");
  }

  const now = new Date();
  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    `${job.name} approved their quote from their project page.`,
    "",
    `Approved by: ${approvedBy}`,
    `Document:    ${quoteName}`,
    // The time, not only the day: an owner reading this at 6pm needs to know whether the
    // approval landed before or after the other things they did today. Both formatters are
    // Las Vegas time, so the two halves cannot disagree about which day it is.
    `When:        ${formatShortDate(now)} at ${formatTime(now)}`,
    projectNo ? `Project:     ${projectNo}` : null,
    "",
    NEXT[outcome],
    `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}${outcome === "paperwork" ? "" : "?tab=quote"}`,
  ].filter((line): line is string => line !== null).join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: approvedBy,
    subject: outcome === "paperwork"
      ? `${SUBJECT.paperwork} ${job.name}${projectNo ? ` — ${projectNo}` : ""}`
      : `${SUBJECT[outcome]} ${projectNo ?? job.name}`,
    text,
  });

  // Resend reports failures in the response body rather than by throwing.
  if (error) {
    throw new Error(`Resend rejected the approval notification: ${error.message}`);
  }
}

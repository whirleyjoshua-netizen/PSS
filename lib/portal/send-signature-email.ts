import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { formatShortDate, formatTime } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import { formatProjectNo } from "./project-no";

/** Only the fields the email needs, so a full Job satisfies it structurally. */
type SignedJob = { id: string; name: string; projectNo?: number | null };

/** Exported so the test asserts the exact sentence. */
export const STAMP_REASONS =
  "Either the PDF could not be opened (for example, it is protected or damaged), or the signed name or email contains characters the PDF font cannot draw. The signature is recorded and valid either way.";

const bareDomain = business.domain.replace(/^https?:\/\//, "");

/**
 * Tells the owners a customer signed their contract.
 *
 * Same four things as the approval email — who, which document, when, where to open the job —
 * plus whether the stamped copy exists, so no owner goes looking for a file that was never made.
 * The document name is the one read server-side; the typed signature name never appears here.
 *
 * replyTo is the address the customer is signed in as, so Reply reaches the person who signed.
 *
 * Always called after the signature is recorded: this may fail without losing it.
 */
export async function notifyOwnersOfSignature(
  job: SignedJob,
  documentName: string,
  signedBy: string,
  stamped: boolean,
  /** The saved signed_at, so the email shows the time on record rather than the send time. */
  signedAt: Date,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Signature notification email is not configured");
  }

  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    `${job.name} signed their contract from their project page.`,
    "",
    `Signed by:   ${signedBy}`,
    `Document:    ${documentName}`,
    // Both formatters are Las Vegas time, so the day and the time cannot disagree.
    `When:        ${formatShortDate(signedAt)} at ${formatTime(signedAt)}`,
    projectNo ? `Project:     ${projectNo}` : null,
    "",
    // Both possible causes are named: this code is not told which one happened.
    stamped ? null : "The stamped copy could not be produced; the signature itself is recorded.",
    stamped ? null : STAMP_REASONS,
    stamped ? null : "",
    `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
  ].filter((line): line is string => line !== null).join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: signedBy,
    subject: `Contract signed: ${documentName}${projectNo ? ` — ${projectNo}` : ""}`,
    text,
  });

  // Resend reports failures in the response body rather than by throwing.
  if (error) {
    throw new Error(`Resend rejected the signature notification: ${error.message}`);
  }
}

/**
 * Sends the customer their copy of what they signed.
 *
 * With a stamped PDF it is attached; without one the email says where the record lives
 * instead — no attachment is better than a broken one.
 *
 * Always called after the signature is recorded: this may fail without losing it.
 */
export async function sendCustomerSignedCopy(
  to: string,
  job: SignedJob,
  documentName: string,
  pdf: Buffer | null,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey) {
    throw new Error("Signed copy email is not configured");
  }

  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    "Thank you — we have your signature.",
    "",
    `Document: ${documentName}`,
    projectNo ? `Project:  ${projectNo}` : null,
    "",
    pdf
      ? "Your signed copy is attached. Keep it for your records."
      : `The signature is recorded on your project page: ${bareDomain}/project`,
    "",
    `Questions? Call us at ${business.phone.display} or just reply to this email.`,
    "",
    business.name,
  ].filter((line): line is string => line !== null).join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: business.email,
    subject: `Signed: ${documentName}`,
    text,
    ...(pdf
      ? {
          attachments: [
            {
              content: pdf,
              filename: `${documentName.replace(/\.pdf$/i, "")} (signed).pdf`,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
  });

  if (error) {
    throw new Error(`Resend rejected the signed copy email: ${error.message}`);
  }
}

import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { ownerRecipients } from "@/lib/leads/email";
import { formatProjectNo } from "./project-no";
import { issueLabel } from "./service-schema";

export type ServiceNotification = {
  /** The NEW job the request created — what the tracker link opens. */
  jobId: string;
  parent: { id: string; name: string; projectNo: number | null };
  issue: string;
  window: string;
  details: string;
  replyTo: string;
  /** True when a photo was sent but could not be attached. */
  photoFailed: boolean;
  /**
   * True when the customer reached the form from their installation acknowledgement — they
   * are telling us the install itself is not right, not reporting a later fault.
   */
  fromAcknowledgement?: boolean;
};

/**
 * Tells the owners a customer asked for a service visit.
 *
 * Plain text for the same reasons as the lead notification, and replyTo is the address the
 * customer is signed in as, so hitting Reply reaches the person who wrote.
 *
 * Always called after the job has been created: this may fail without losing the request.
 */
export async function notifyOwnersOfServiceRequest(input: ServiceNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Service request email is not configured");
  }

  const projectNo = formatProjectNo(input.parent.projectNo);
  const text = [
    `${input.parent.name} asked for a service visit.`,
    // First, because it changes what this email means: they were asked whether the install was
    // right and answered that it is not. Their review request has been muted until it is fixed.
    input.fromAcknowledgement
      ? "They said this when confirming their installation — they are telling us the install is not right.\n" +
        "Their review request has been turned off until this is put right. Turn it back on from the job's Review section."
      : null,
    `What is happening: ${issueLabel(input.issue)}`,
    `Window: ${input.window}`,
    projectNo ? `Original project: ${projectNo}` : null,
    `Original job: ${adminOrigin()}/admin/jobs/${input.parent.id}`,
    `Reply to: ${input.replyTo}`,
    `Open the service job: ${adminOrigin()}/admin/jobs/${input.jobId}`,
    "",
    "What they told us:",
    input.details || "(nothing else)",
    input.photoFailed ? "\nThey sent a photo, but it could not be attached. Ask them for it." : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: input.replyTo,
    subject: input.fromAcknowledgement
      ? `Installation not right — ${input.parent.name}${projectNo ? ` — ${projectNo}` : ""}`
      : `Service request from ${input.parent.name}${projectNo ? ` — ${projectNo}` : ""}`,
    text,
  });

  // Resend reports failures in the response body rather than by throwing.
  if (error) {
    throw new Error(`Resend rejected the service request notification: ${error.message}`);
  }
}

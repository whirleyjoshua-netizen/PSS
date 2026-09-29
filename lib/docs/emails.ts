import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { adminOrigin } from "@/lib/admin/origin";
import { formatShortDate, formatTime } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import { normalizeEmail } from "@/lib/portal/access";
import { INVITE_MINUTES, issueCustomerLink } from "@/lib/portal/login";
import { formatProjectNo } from "@/lib/portal/project-no";
import type { DocResponse } from "./kinds";

const fromAddress = () => process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

/**
 * Tells the client a document is ready (spec §6 step 4), with a sign-in link. Plain text, like
 * sendContractEmail. Throws on any failure: the caller has already sent the document and reports
 * the failed email to the owner.
 */
export async function sendDocumentEmail(job: Pick<Job, "name" | "email">, title: string, response: DocResponse): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const email = normalizeEmail(job.email);
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!email) throw new Error("This job has no email address");
  const verb = response === "sign" ? "sign" : "review";
  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0] || "";
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${fromAddress()}>`, to: email, replyTo: business.email,
    subject: `Your ${title} is ready to ${verb}`,
    text: [
      firstName ? `Hi ${firstName},` : "Hi there,", "",
      `Your ${title} is ready. You can ${verb} it on your project page:`, "",
      link, "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n"),
  });
  if (error) throw new Error(`Resend rejected the document email: ${error.message}`);
}

/**
 * Tells the owners a client acknowledged a document: who, which, when, where to open the job.
 * The typed name never appears; replyTo is the address the client is signed in as. The subject
 * carries only the title, so the project number is not repeated; the body has the Project: line.
 */
export async function notifyOwnersOfDocumentAcknowledgement(
  job: { id: string; name: string; projectNo?: number | null },
  title: string,
  acknowledgedBy: string,
  acknowledgedAt: Date,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  if (!apiKey || to.length === 0) throw new Error("Acknowledgement notification email is not configured");
  const projectNo = formatProjectNo(job.projectNo);
  const text = [
    `${job.name.trim() || "The client"} acknowledged a document from their project page.`,
    "",
    `Acknowledged by: ${acknowledgedBy}`,
    `Document:        ${title}`,
    `When:            ${formatShortDate(acknowledgedAt)} at ${formatTime(acknowledgedAt)}`,
    projectNo ? `Project:         ${projectNo}` : null,
    "",
    `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
  ].filter((line): line is string => line !== null).join("\n");
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${fromAddress()}>`, to, replyTo: acknowledgedBy,
    subject: `Document acknowledged: ${title}`,
    text,
  });
  if (error) throw new Error(`Resend rejected the acknowledgement notification: ${error.message}`);
}

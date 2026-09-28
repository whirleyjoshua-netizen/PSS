import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { normalizeEmail } from "@/lib/portal/access";
import { INVITE_MINUTES, issueCustomerLink } from "@/lib/portal/login";

/** Tells the client their contract is ready, with a sign-in link. Plain text, like sendPortalInvite. Throws on failure. */
export async function sendContractEmail(job: Job, fileName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  const email = normalizeEmail(job.email);
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!email) throw new Error("This job has no email address");
  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0] || "";
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`, to: email, replyTo: business.email,
    subject: `Your ${business.name} proposal is ready to sign`,
    text: [
      firstName ? `Hi ${firstName},` : "Hi there,", "",
      `Your proposal (${fileName}) is ready. You can review it and sign it on your project page:`, "",
      link, "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n"),
  });
  if (error) throw new Error(`Resend rejected the contract email: ${error.message}`);
}

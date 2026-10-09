import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { ownerRecipients } from "@/lib/leads/email";
import { normalizeEmail } from "@/lib/portal/access";
import { INVITE_MINUTES, issueCustomerLink } from "@/lib/portal/login";

/** Stands in for the client's sign-in link in the owners' copy: the link signs whoever opens it in as the client. */
export const OWNER_COPY_LINK = "[the client's private sign-in link]";

/**
 * Spec §2: "Your quote is ready", with a sign-in link. Plain text, like sendContractEmail. Throws on failure.
 * Once the client's email is accepted, the owners get a copy of it word for word (the link swapped for
 * OWNER_COPY_LINK) with the quote PDF the client sees attached. A failed copy is logged, never thrown:
 * the client's email already went.
 */
export async function sendQuoteEmail(job: Job, fileName: string, pdf: Uint8Array): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  const email = normalizeEmail(job.email);
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!email) throw new Error("This job has no email address");
  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0] || "";
  const subject = `Your ${business.name} quote is ready`;
  const body = (url: string) => [
    firstName ? `Hi ${firstName},` : "Hi there,", "",
    `Your quote (${fileName}) is ready. You can review it and approve it on your project page:`, "",
    url, "",
    "Once you approve it, we send your contract to sign.", "",
    `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
  ].join("\n");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `${business.name} <${from}>`, to: email, replyTo: business.email, subject, text: body(link),
  });
  if (error) throw new Error(`Resend rejected the quote email: ${error.message}`);

  try {
    const to = ownerRecipients();
    if (to.length === 0) throw new Error("LEAD_NOTIFICATION_EMAIL is not set");
    const copy = await resend.emails.send({
      from: `${business.name} <${from}>`, to,
      subject: `Sent to ${job.name.trim()}: ${subject}`,
      text: [
        `${job.name.trim()} (${email}) was just sent this email. ${fileName} is attached, the same quote they see on their project page.`,
        "", "----------", `Subject: ${subject}`, "", body(OWNER_COPY_LINK),
      ].join("\n"),
      attachments: [{ content: Buffer.from(pdf), filename: fileName, contentType: "application/pdf" }],
    });
    if (copy.error) throw new Error(copy.error.message);
  } catch (copyError) {
    console.error(`Quote ${fileName} emailed to the client but the owners' copy failed`, copyError);
  }
}

import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { formatPhone, type ConsultationInput } from "./schema";

/**
 * Sends the "you have a new consultation request" email.
 *
 * Plain text on purpose: it renders identically on every phone, never lands in
 * a promotions tab for being image-heavy, and is faster to read one-handed on a
 * job site than an HTML template would be.
 */
export async function sendLeadNotification(
  input: ConsultationInput,
  leadId: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  // Comma-separated, so both owners get every lead.
  const to = (process.env.LEAD_NOTIFICATION_EMAIL ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Lead notification email is not configured");
  }

  const lines = [
    `Open in tracker: ${adminOrigin()}/admin/jobs/${leadId}`,
    "",
    `Name:       ${input.name}`,
    `Phone:      ${formatPhone(input.phone)}`,
    `Email:      ${input.email}`,
    `City:       ${input.city}`,
    input.address ? `Address:    ${input.address}` : null,
    input.treatments?.length ? `Interested: ${input.treatments.join(", ")}` : null,
    input.windowCount ? `Windows:    ${input.windowCount}` : null,
    input.heardVia ? `Heard via:  ${input.heardVia}` : null,
    input.notes ? `\nNotes:\n${input.notes}` : null,
    `\nSubmitted from the ${input.source} form on ${business.domain}.`,
  ].filter((line): line is string => line !== null);

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: input.email,
    subject: `New consultation request — ${input.name}, ${input.city}`,
    text: lines.join("\n"),
  });

  // Resend reports failures in the response body rather than by throwing.
  if (error) {
    throw new Error(`Resend rejected the notification: ${error.message}`);
  }
}

/**
 * Sends the visitor their "we got your request" email. Plain text for the same
 * reasons as the notification, and it keeps it out of the promotions tab.
 * Replies go to the business inbox rather than the no-reply sender.
 */
export async function sendCustomerConfirmation(
  input: ConsultationInput,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey) {
    throw new Error("Customer confirmation email is not configured");
  }

  const firstName = input.name.trim().split(/\s+/)[0];

  const text = [
    `Hi ${firstName},`,
    "",
    `Thank you for reaching out to ${business.name}. We have your request for a free in-home consultation.`,
    "",
    "What happens next:",
    "",
    "1. We call you within one business day to find a time that works.",
    "2. At the visit we bring real samples to your windows, measure every opening, and give you a quote before we leave. No charge, no obligation.",
    "3. Your window treatments are made to order, and we install them ourselves.",
    "",
    "Before we visit, it helps to think about which rooms matter most, whether glare, heat, or privacy is the main problem, and to have everyone who is deciding at home.",
    "",
    `Need us sooner? Call ${business.phone.display} or just reply to this email.`,
    "",
    `${business.name}`,
    business.domain,
  ].join("\n");

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: input.email,
    replyTo: business.email,
    subject: `We received your consultation request, ${firstName}`,
    text,
  });

  if (error) {
    throw new Error(`Resend rejected the confirmation: ${error.message}`);
  }
}

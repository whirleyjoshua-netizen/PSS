import { Resend } from "resend";
import { adClickLabel } from "./attribution";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { GOOGLE_FORM_SOURCE, formatPhone, leadSourceLabel, type ConsultationInput, type LeadSource } from "./schema";

/** Every owner address in LEAD_NOTIFICATION_EMAIL (comma-separated). */
export function ownerRecipients(): string[] {
  return (process.env.LEAD_NOTIFICATION_EMAIL ?? "").split(",").map((address) => address.trim()).filter(Boolean);
}

/** A website lead, or a Google lead form lead (which may have no email address). */
export type LeadNotificationInput = Omit<ConsultationInput, "email" | "source"> & {
  email: string | null;
  source: LeadSource | typeof GOOGLE_FORM_SOURCE;
};

/**
 * Sends the "you have a new consultation request" email.
 *
 * Plain text on purpose: it renders identically on every phone, never lands in
 * a promotions tab for being image-heavy, and is faster to read one-handed on a
 * job site than an HTML template would be.
 */
export async function sendLeadNotification(
  input: LeadNotificationInput,
  leadId: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || to.length === 0) {
    throw new Error("Lead notification email is not configured");
  }

  const lines = [
    `Open in tracker: ${adminOrigin()}/admin/jobs/${leadId}`,
    "",
    `Name:       ${input.name}`,
    `Phone:      ${formatPhone(input.phone)}`,
    `Email:      ${input.email ?? "(none given)"}`,
    `City:       ${input.city}`,
    // A Google lead form lead's address is only the ZIP it gave.
    input.address
      ? input.source === GOOGLE_FORM_SOURCE
        ? `ZIP:        ${input.address}`
        : `Address:    ${input.address}`
      : null,
    input.treatments?.length ? `Interested: ${input.treatments.join(", ")}` : null,
    input.windowCount ? `Windows:    ${input.windowCount}` : null,
    input.heardVia ? `Heard via:  ${input.heardVia}` : null,
    adClickLabel(input.attribution) ? `Ad click:   ${adClickLabel(input.attribution)}` : null,
    input.notes ? `\nNotes:\n${input.notes}` : null,
    input.source === GOOGLE_FORM_SOURCE
      ? `\nSubmitted from the ${leadSourceLabel(input.source)}.`
      : `\nSubmitted from the ${input.source} form on ${business.domain}.`,
  ].filter((line): line is string => line !== null);

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to,
    replyTo: input.email ?? undefined,
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
    "1. We call you within 3 business days to find a time that works.",
    "2. At the visit we bring real samples to your windows, measure each window, and can give you a quote before we leave. No charge, no obligation.",
    "3. If you choose to move forward, your window treatments are made to order, and we install them ourselves.",
    "",
    "Before we visit, it helps to think about which rooms matter most, whether glare, heat, or privacy is the main problem, and to have everyone who is deciding at home.",
    "",
    `Need us sooner? Call or text us at ${business.phone.display} or reply to this email.`,
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

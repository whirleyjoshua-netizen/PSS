import { Resend } from "resend";
import { business } from "@/content/business";
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
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_NOTIFICATION_EMAIL;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";

  if (!apiKey || !to) {
    throw new Error("Lead notification email is not configured");
  }

  const lines = [
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

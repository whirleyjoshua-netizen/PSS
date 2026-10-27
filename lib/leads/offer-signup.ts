import "server-only";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { business } from "@/content/business";
import { liveOffers } from "@/content/offer-popup";
import { HD_RESTRICTED_EXCLUSION } from "@/content/offer-terms";
import { adminOrigin } from "@/lib/admin/origin";
import { trafficSourceLabel } from "./attribution";
import { OFFER_SOURCE, type OfferSignupInput } from "./schema";

/** The lead's notes: where it came from, then each offer running when they signed up, so the quote takes it off. */
export function offerSignupNotes(now: Date): string {
  const offers = liveOffers(now).map((offer) => offer.note);
  return ["Offer pop-up sign-up: name and email only, not booked yet.", ...offers].join(" ");
}

/**
 * Stores the sign-up as a lead in New, with the id the caller chose (so the owner email can link to it), assigned to
 * the Settings default like a website lead (lib/leads/db.ts). It has no phone or city: both are stored empty, which
 * the job page shows as missing.
 */
export async function insertOfferLead(input: OfferSignupInput & { id: string; notes: string }): Promise<{ id: string }> {
  const ad = input.attribution ?? {};
  const rows = await db()`
    insert into leads
      (id, name, phone, email, city, notes, source, assigned_to,
       gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_term, landing_page, ad_clicked_at)
    values
      (${input.id}, ${input.name}, ${""}, ${input.email}, ${""}, ${input.notes}, ${OFFER_SOURCE},
       (select default_assignee from lead_settings where id),
       ${ad.gclid ?? null}, ${ad.gbraid ?? null}, ${ad.wbraid ?? null}, ${ad.utmSource ?? null},
       ${ad.utmMedium ?? null}, ${ad.utmCampaign ?? null}, ${ad.utmTerm ?? null}, ${ad.landingPage ?? null},
       ${ad.clickedAt ?? null})
    returning id
  `;
  const id = rows[0]?.id;
  if (typeof id !== "string") throw new Error("Offer sign-up insert returned no id");
  return { id };
}

function mailer() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) throw new Error("Offer emails are not configured");
  return { resend: new Resend(apiKey), from: `${business.name} <${from}>` };
}

/** The owners' email, plain text like the lead email (lib/leads/email.ts), but marked as a sign-up, not a request. */
export async function sendOfferNotification(input: OfferSignupInput & { notes: string }, leadId: string, to: string[]): Promise<void> {
  if (to.length === 0) throw new Error("Lead notification email is not configured");
  const { resend, from } = mailer();
  const lines = [
    "Signed up for the offer on the website. Not booked yet, and no phone number: follow up by email.",
    "",
    `Open in tracker: ${adminOrigin()}/admin/jobs/${leadId}`,
    "",
    `Name:       ${input.name}`,
    `Email:      ${input.email}`,
    trafficSourceLabel(input.attribution) ? `Came from:  ${trafficSourceLabel(input.attribution)}` : null,
    `\nNotes:\n${input.notes}`,
  ].filter((line): line is string => line !== null);

  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: input.email,
    subject: `New offer sign-up — ${input.name}`,
    text: lines.join("\n"),
  });
  if (error) throw new Error(`Resend rejected the notification: ${error.message}`);
}

/** The visitor's email: the offers running now and how to claim them. Replies go to the business inbox. */
export async function sendOfferEmail(input: OfferSignupInput, now: Date): Promise<void> {
  const { resend, from } = mailer();
  const firstName = input.name.trim().split(/\s+/)[0];
  const text = [
    `Hi ${firstName},`,
    "",
    `Thank you for your interest in ${business.name}. Here is your offer:`,
    "",
    ...liveOffers(now).map((offer) => `- ${offer.line}`),
    HD_RESTRICTED_EXCLUSION,
    "",
    "To use it, book your free in-home consultation. We bring real samples to your windows, measure each one, and send you a written quote. No charge, no obligation.",
    "",
    `Book a time online: ${business.domain}/#book`,
    `Or call or text us at ${business.phone.display}, or reply to this email.`,
    "",
    business.name,
    business.domain,
  ].join("\n");

  const { error } = await resend.emails.send({
    from,
    to: input.email,
    replyTo: business.email,
    subject: `Your ${business.name} offer, ${firstName}`,
    text,
  });
  if (error) throw new Error(`Resend rejected the offer email: ${error.message}`);
}

import "server-only";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { business } from "@/content/business";
import { liveOffers } from "@/content/offer-popup";
import { HD_RESTRICTED_EXCLUSION } from "@/content/offer-terms";
import { adminOrigin } from "@/lib/admin/origin";
import { trafficSourceLabel } from "./attribution";
import { CALLBACK_WINDOW } from "@/content/consultation";
import { OFFER_SOURCE, formatPhone, type OfferSignupInput } from "./schema";

/** A pop-up sign-up with a phone number is a consultation request: the owners call (owner 2026-11-06). */
export const offerHasPhone = (input: { phone?: string }): boolean => Boolean(input.phone);

/** The lead's notes: where it came from, then each offer running when they signed up, so the quote takes it off. */
export function offerSignupNotes(now: Date, withPhone = false): string {
  const offers = liveOffers(now).map((offer) => offer.note);
  const first = withPhone
    ? "Offer pop-up consultation request: name, email and phone, not booked yet. Call them."
    : "Offer pop-up sign-up: name and email only, not booked yet.";
  return [first, ...offers].join(" ");
}

/**
 * Stores the sign-up as a lead in New, with the id the caller chose (so the owner email can link to it), assigned to
 * the Settings default like a website lead (lib/leads/db.ts). It has no city, and no phone unless they gave one: a
 * missing value is stored empty, which the job page shows as missing.
 */
export async function insertOfferLead(input: OfferSignupInput & { id: string; notes: string }): Promise<{ id: string }> {
  const ad = input.attribution ?? {};
  const rows = await db()`
    insert into leads
      (id, name, phone, email, city, notes, source, assigned_to,
       gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_term, landing_page, ad_clicked_at)
    values
      (${input.id}, ${input.name}, ${input.phone ?? ""}, ${input.email}, ${""}, ${input.notes}, ${OFFER_SOURCE},
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
  const withPhone = offerHasPhone(input);
  const lines = [
    withPhone
      ? `Asked for a consultation through the offer pop-up. Not booked yet: call them ${CALLBACK_WINDOW}.`
      : "Signed up for the offer on the website. Not booked yet, and no phone number: follow up by email.",
    "",
    `Open in tracker: ${adminOrigin()}/admin/jobs/${leadId}`,
    "",
    `Name:       ${input.name}`,
    withPhone ? `Phone:      ${formatPhone(input.phone ?? "")}` : null,
    `Email:      ${input.email}`,
    trafficSourceLabel(input.attribution) ? `Came from:  ${trafficSourceLabel(input.attribution)}` : null,
    `\nNotes:\n${input.notes}`,
  ].filter((line): line is string => line !== null);

  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: input.email,
    subject: withPhone ? `New consultation request (offer pop-up) — ${input.name}` : `New offer sign-up — ${input.name}`,
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
    ...(offerHasPhone(input)
      ? [
          `We'll call you ${CALLBACK_WINDOW} to set up your free in-home consultation. We bring real samples to your windows, measure each one, and send you a written quote. No charge, no obligation.`,
          "",
          `Want to pick a time now? Book online: ${business.domain}/#book`,
          `Or call or text us at ${business.phone.display}, or reply to this email.`,
        ]
      : [
          "To use it, book your free in-home consultation. We bring real samples to your windows, measure each one, and send you a written quote. No charge, no obligation.",
          "",
          `Book a time online: ${business.domain}/#book`,
          `Or call or text us at ${business.phone.display}, or reply to this email.`,
        ]),
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

import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { formatCents } from "@/lib/admin/money";
import { stageLabel } from "@/lib/admin/stages";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import { orderBeforeTaxCents, type HdOrder } from "./order-parse";
import type { ImportOutcome } from "./types";

const HOW_TO_SEND = "In Direct Connect: Reports → Dealer Copy → Email → tick Owner and Include dealer costs → Generate.";

/**
 * What to tell the owners about one Dealer Copy, or null when there is nothing to say.
 * `missingOption` is the option letter when the PO named a real job's option that was never added
 * (PSS-1042-B on job 1042 with no option B); null or absent for every other no-match. Its email then
 * carries that job's link, so `jobId` is the job lacking the option.
 */
export function importEmail(input: { outcome: ImportOutcome; dcQuoteNo: string | null; projectNo: string | null; jobId: string | null; version?: number; detail: string | null; missingOption?: string | null }): { subject: string; text: string } | null {
  const quote = input.dcQuoteNo ? `DC quote ${input.dcQuoteNo}` : "A Direct Connect Dealer Copy";
  const link = input.jobId ? `Open the job: ${adminOrigin()}/admin/jobs/${input.jobId}?tab=quote` : null;
  const lines = (...parts: (string | null)[]) => parts.filter((p): p is string => p !== null).join("\n");
  switch (input.outcome) {
    case "imported":
      return { subject: `${input.projectNo}: quote v${input.version} ready to review`,
        text: lines(`${quote} arrived for ${input.projectNo} as version ${input.version}.`, "", "Review the prices and send the contract from the job's Quote tab.", link) };
    case "no-po":
    case "no-match": {
      const subject = `${quote} could not be matched to a job`;
      const option = input.outcome === "no-match" ? input.missingOption ?? null : null;
      if (option) {
        // The owner forgot Add another quote (quote options spec §4). The PO stays as printed:
        // changing it to the job's own number would import option B's prices as a new version of option A.
        return { subject: `${quote} for ${input.detail}: option ${option} not added yet`, text: lines(
          `${quote} names ${input.detail}, but that job has no quote option ${option} yet.`, "",
          `Keep ${input.detail} in PO Reference. Add option ${option} with Add another quote on the job's Quote tab, then send the Dealer Copy again.`,
          HOW_TO_SEND, link) };
      }
      const why = input.outcome === "no-po"
        ? `${quote} has no valid PSS number in PO Reference (${input.detail ?? "blank"}).`
        : `${quote} names ${input.detail ?? "a PSS number"} but no job has that number.`;
      return { subject,
        text: lines(why, "", "Open the quote in Direct Connect, put the job's number (e.g. PSS-1042) in PO Reference, save, and send the Dealer Copy again.", HOW_TO_SEND) };
    }
    case "no-costs":
      return { subject: `${quote} arrived without dealer costs`, text: lines(`${quote} was sent without costs, so it can't be priced.`, "", `Send it again with Include dealer costs ticked. ${HOW_TO_SEND}`) };
    case "incomplete":
      return { subject: `${quote} has an unfinished line`, text: lines(`${quote}: ${input.detail}.`, "", "Finish that line in Direct Connect, then send the Dealer Copy again.") };
    case "unreadable":
      return { subject: `${quote} could not be read`, text: lines(`${quote} wasn't in the expected format (${input.detail}).`, "", "The email was left in support@. A developer needs to look at it before it can be imported.") };
    default:
      return null; // unchanged: nothing to say. failed: see staleFailuresEmail.
  }
}

/**
 * Dealer Copies that have kept failing for over a day (spec §9: `failed` is only emailed once it
 * has failed again on later runs). One email per run, one line per message.
 */
export function staleFailuresEmail(failures: { quoteNo: string | null; receivedAt: Date; kind?: "dealer-copy" | "receipt" | "order" }[]): { subject: string; text: string } {
  const what = (f: (typeof failures)[number]) =>
    f.kind === "order" ? "An HD order confirmation"
      : f.kind === "receipt" ? "A Direct Connect order receipt"
        : `A Dealer Copy (${f.quoteNo ? `quote #${f.quoteNo}` : "quote number unknown"})`;
  return {
    subject: failures.every((f) => (f.kind ?? "dealer-copy") === "dealer-copy")
      ? "A Dealer Copy has failed to import for over a day" : "A Direct Connect email has failed to import for over a day",
    text: failures.map((f) => `${what(f)} has failed to import since ${formatShortDate(f.receivedAt)}. A developer should look.`).join("\n"),
  };
}

const jobLink = (jobId: string) => `Open the job: ${adminOrigin()}/admin/jobs/${jobId}`;

/**
 * HD confirmed an order that was recorded on its job. Says where the job's stage went and whether HD's figure
 * before tax matches the option's quoted dealer total. `quotedCents` is null when the option had no quote.
 */
export function orderEmail(input: { order: HdOrder; jobId: string; fromStatus: string; toStatus: string; quotedCents: number | null }): { subject: string; text: string } {
  const o = input.order;
  const beforeTax = orderBeforeTaxCents(o);
  const stage = input.fromStatus !== input.toStatus
    ? `The job moved from ${stageLabel(input.fromStatus)} to ${stageLabel(input.toStatus)}.`
    : input.toStatus === "ordered" || input.toStatus === "installed" || input.toStatus === "completed"
      ? `The job was already at ${stageLabel(input.toStatus)}, so its stage did not change.`
      : `The job is at ${stageLabel(input.toStatus)}, so it was not moved to Ordered. Check it.`;
  const cost = input.quotedCents === null
    ? `No quote was found for ${o.poReference} to compare the cost with.`
    : input.quotedCents === beforeTax
      ? `That matches the quoted dealer cost of ${formatCents(input.quotedCents)} before tax.`
      : `That does not match the quote. Quoted dealer cost ${formatCents(input.quotedCents)}, HD charged ${formatCents(beforeTax)} before tax.`;
  return {
    subject: `${o.poReference} ordered: HD order ${o.orderNo}`,
    text: [
      `Hunter Douglas confirmed order ${o.orderNo} for ${o.poReference} on ${formatDateOnly(o.orderDate)}.`,
      `Total ${formatCents(o.totalCents)}: products ${formatCents(o.subtotalCents)}, handling ${formatCents(o.handlingCents)}` +
        `${o.oversizeCents ? `, oversize ${formatCents(o.oversizeCents)}` : ""}, tax ${formatCents(o.taxCents)}.`,
      cost, "", stage, jobLink(input.jobId),
    ].join("\n"),
  };
}

/**
 * An HD order confirmation that could not be recorded on a job. `orderNo` is null when it could not be read.
 * Nothing moved, so the owners move the job by hand.
 */
export function orderRefusalEmail(input: { outcome: "no-po" | "no-match" | "unreadable"; orderNo: string | null; detail: string }): { subject: string; text: string } {
  const order = input.orderNo ? `HD order ${input.orderNo}` : "An HD order confirmation";
  const byHand = "Move the job to Ordered by hand.";
  switch (input.outcome) {
    case "no-po":
      return { subject: `${order} could not be matched to a job`,
        text: `${input.detail}, which is not a PSS number. ${byHand}\n\nNext time, put the job's number (e.g. PSS-1042) in PO Reference in Direct Connect before submitting.` };
    case "no-match":
      return { subject: `${order} could not be matched to a job`,
        text: `${order} names ${input.detail}, but no job or quote option has that number. ${byHand}` };
    default:
      return { subject: `${order} could not be read`,
        text: `${order} wasn't in the expected format (${input.detail}). ${byHand}\n\nThe email was left in support@. A developer needs to look at it.` };
  }
}

/** Orders DC received over a day ago that HD has not confirmed. One email per run, one line per order. */
export function staleReceiptsEmail(receipts: { quoteNo: string | null; poReference: string; receivedAt: Date }[]): { subject: string; text: string } {
  return {
    subject: receipts.length === 1 ? `${receipts[0].poReference} has no order confirmation from HD` : "Orders with no confirmation from HD",
    text: [
      ...receipts.map((r) =>
        `Direct Connect received ${r.quoteNo ? `quote ${r.quoteNo}` : "an order"} for ${r.poReference} on ${formatShortDate(r.receivedAt)}, but Hunter Douglas has not sent its order confirmation.`),
      "", "Check the order in Direct Connect or call HD at 844-486-8373.",
    ].join("\n"),
  };
}

/** Plain text to the owners. Throws when misconfigured or rejected. Used by the DC import and the deposit flow. */
export async function notifyOwners(email: { subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey || to.length === 0) throw new Error("Owner notification email is not configured");
  const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text });
  if (error) throw new Error(`Resend rejected the owner notification: ${error.message}`);
}

import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
import { formatShortDate } from "@/lib/admin/time";
import { ownerRecipients } from "@/lib/leads/email";
import type { ImportOutcome } from "./types";

const HOW_TO_SEND = "In Direct Connect: Reports → Dealer Copy → Email → tick Owner and Include dealer costs → Generate.";

/** What to tell the owners about one Dealer Copy, or null when there is nothing to say. */
export function importEmail(input: { outcome: ImportOutcome; dcQuoteNo: string | null; projectNo: string | null; jobId: string | null; version?: number; detail: string | null }): { subject: string; text: string } | null {
  const quote = input.dcQuoteNo ? `DC quote ${input.dcQuoteNo}` : "A Direct Connect Dealer Copy";
  const link = input.jobId ? `Open the job: ${adminOrigin()}/admin/jobs/${input.jobId}?tab=quote` : null;
  const lines = (...parts: (string | null)[]) => parts.filter((p): p is string => p !== null).join("\n");
  switch (input.outcome) {
    case "imported":
      return { subject: `${input.projectNo}: quote v${input.version} ready to review`,
        text: lines(`${quote} arrived for ${input.projectNo} as version ${input.version}.`, "", "Review the prices and send the contract from the job's Quote tab.", link) };
    case "no-po":
    case "no-match":
      return { subject: `${quote} could not be matched to a job`,
        text: lines(input.outcome === "no-po"
          ? `${quote} has no valid PSS number in PO Reference (${input.detail ?? "blank"}).`
          : `${quote} names ${input.detail ?? "a PSS number"} but no job has that number.`, "",
          "Open the quote in Direct Connect, put the job's number (e.g. PSS-1042) in PO Reference, save, and send the Dealer Copy again.", HOW_TO_SEND) };
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
export function staleFailuresEmail(failures: { quoteNo: string | null; receivedAt: Date }[]): { subject: string; text: string } {
  return {
    subject: "A Dealer Copy has failed to import for over a day",
    text: failures.map((f) =>
      `A Dealer Copy (${f.quoteNo ? `quote #${f.quoteNo}` : "quote number unknown"}) has failed to import since ${formatShortDate(f.receivedAt)}. A developer should look.`,
    ).join("\n"),
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

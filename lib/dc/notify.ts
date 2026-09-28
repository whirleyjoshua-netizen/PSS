import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "@/lib/admin/origin";
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
        text: lines(`${quote} has no valid PSS number in PO Reference (${input.detail ?? "blank"}).`, "",
          "Open the quote in Direct Connect, put the job's number (e.g. PSS-1042) in PO Reference, save, and send the Dealer Copy again.", HOW_TO_SEND) };
    case "no-costs":
      return { subject: `${quote} arrived without dealer costs`, text: lines(`${quote} was sent without costs, so it can't be priced.`, "", `Send it again with Include dealer costs ticked. ${HOW_TO_SEND}`) };
    case "incomplete":
      return { subject: `${quote} has an unfinished line`, text: lines(`${quote}: ${input.detail}.`, "", "Finish that line in Direct Connect, then send the Dealer Copy again.") };
    case "unreadable":
      return { subject: `${quote} could not be read`, text: lines(`${quote} wasn't in the expected format (${input.detail}).`, "", "The email was left in support@. A developer needs to look at it before it can be imported.") };
    default:
      return null; // unchanged: nothing to say. failed: reported by the cron response and logs.
  }
}

/** Plain text to the owners, like the approval email. Throws when misconfigured or rejected. */
export async function notifyOwners(email: { subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey || to.length === 0) throw new Error("DC import notification email is not configured");
  const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text });
  if (error) throw new Error(`Resend rejected the DC import notification: ${error.message}`);
}

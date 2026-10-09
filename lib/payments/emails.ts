import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { getJob, type Job } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import { adminOrigin } from "@/lib/admin/origin";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import { notifyOwners } from "@/lib/dc/notify";
import { stageLabel } from "@/lib/admin/stages";
import { cancellationWindowLastDay } from "@/lib/docs/business-days";
import { normalizeEmail } from "@/lib/portal/access";
import { formatProjectNo } from "@/lib/portal/project-no";
import { depositState, type DepositMethod } from "./deposits";
import { PAID_HOW } from "./paid-how";

/** Plain text to the client, like the contract email. Throws when misconfigured or rejected. */
async function emailClient(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, replyTo: business.email, subject, text });
  if (error) throw new Error(`Resend rejected the client email: ${error.message}`);
}

const greeting = (job: Pick<Job, "name">): string => {
  const first = job.name.trim().split(/\s+/)[0] || "";
  return first ? `Hi ${first},` : "Hi there,";
};

/** Runs every send; a failure is logged, never thrown, because what it reports is already recorded. */
async function settle(label: string, sends: Promise<void>[]): Promise<void> {
  for (const result of await Promise.allSettled(sends)) {
    if (result.status === "rejected") console.error(`${label} email failed`, result.reason);
  }
}

/**
 * The receipts for the job's paid deposit (spec §4): the client's, with the figures on record and the
 * last day to cancel, and the owners' note that the job is Sold.
 *
 * stageBefore is the job's stage before the payment was written (the webhook knows it). A payment on a
 * job that was not in Signed is still recorded but moves no stage (ruling P11c), so the owners' note says
 * so and asks them to review the job instead of claiming it is Sold. Omitted, the job was Signed.
 */
export async function sendDepositReceipts(leadId: string, options: { stageBefore?: string | null } = {}): Promise<void> {
  const [job, state] = await Promise.all([getJob(leadId), depositState(leadId)]);
  if (!job || !state?.paid) return;
  const deposit = state.paid;
  const projectNo = formatProjectNo(job.projectNo) ?? "your project";
  const how = PAID_HOW[deposit.method];
  const lastDay = formatDateOnly(cancellationWindowLastDay(state.signedAt));
  const to = normalizeEmail(job.email);
  const wasSigned = options.stageBefore === undefined || options.stageBefore === "signed";
  // The payment's statement skips Sold when an official measure was already recorded.
  const measured = wasSigned && job.status === "measure";
  const sends: Promise<void>[] = [];
  if (to) {
    sends.push(emailClient(to, `Payment received — ${projectNo}`, [
      greeting(job), "",
      // Ruling P12: a job that was not Signed is under the owners' review, so nothing is promised.
      wasSigned
        ? "Payment received — thank you. Your order is confirmed."
        : `We received your deposit of ${formatCents(deposit.amountCents)} — ${business.name} will be in touch.`, "",
      `Contract total:   ${formatCents(state.soldCents)}`,
      `Deposit paid:     ${formatCents(deposit.amountCents)} ${how} on ${formatShortDate(deposit.paidAt ?? new Date())}`,
      `Balance due at installation: ${formatCents(state.soldCents - deposit.amountCents)}`, "",
      ...(wasSigned
        ? [measured ? "Your windows are already measured, so next we place your order." : "Next, we will call you to book your final measure.",
          `You may cancel until the end of ${lastDay}. If you do, we refund your deposit in full.`, ""]
        : []),
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n")));
  }
  sends.push(notifyOwners({
    subject: `Deposit paid: ${projectNo} — ${formatCents(deposit.amountCents)}`,
    text: [
      // An owner may record a different amount than the 50%: then the line states what was recorded.
      deposit.amountCents === state.amountCents
        ? `${job.name} paid the 50% deposit of ${formatCents(deposit.amountCents)} ${how}.`
        : `${job.name} paid a deposit of ${formatCents(deposit.amountCents)} ${how}. The 50% deposit is ${formatCents(state.amountCents)}.`, "",
      `Project:  ${projectNo}`,
      `Contract: ${formatCents(state.soldCents)}`,
      deposit.recordedBy ? `Recorded by: ${deposit.recordedBy}` : null, "",
      measured
        ? `The job has moved to Official measure: its official measure was already recorded, so there is no measure to book. Order after the cancellation window closes at the end of ${lastDay}.`
        : wasSigned
        ? `The job has moved to Sold. Book the official measure. Order after the cancellation window closes at the end of ${lastDay}.`
        : `The job was not in Signed (it was ${stageLabel(options.stageBefore ?? "unknown")}), so its stage was not changed. Review this job: the payment is recorded, but it may need refunding or moving on by hand.`,
      `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}?tab=quote`,
    ].filter((line): line is string => line !== null).join("\n"),
  }));
  await settle("A deposit receipt", sends);
}

/** A verified card payment PSS could not apply (Review Focus 1 and 3). Throws on failure; callers catch. */
export async function alertUnmatchedPayment(input: { sessionId: string; amountCents: number | null; depositId: string | null; reason: string }): Promise<void> {
  await notifyOwners({
    subject: "A card payment needs checking in Stripe",
    text: [
      "Stripe reported a paid deposit checkout that PSS did not record.", "",
      input.reason, "",
      `Checkout Session: ${input.sessionId}`,
      `Amount:           ${input.amountCents === null ? "unknown" : formatCents(input.amountCents)}`,
      `Deposit:          ${input.depositId ?? "none"}`, "",
      "Open the payment in the Stripe dashboard (search for the Checkout Session) and refund it if it is a second payment for the same deposit.",
    ].join("\n"),
  });
}

/**
 * Ruling P16: Stripe refunded the card but PSS could not record the cancellation, so the job still shows
 * the deposit paid. The owners are told to press Cancel & refund again (it will not refund twice).
 * Throws on failure; callers catch.
 */
export async function alertUnrecordedRefund(input: { job: Pick<Job, "id" | "name" | "projectNo">; depositId: string; amountCents: number }): Promise<void> {
  const projectNo = formatProjectNo(input.job.projectNo) ?? "a job";
  await notifyOwners({
    subject: `Refunded but not recorded: ${projectNo}`,
    text: [
      `${input.job.name}'s deposit of ${formatCents(input.amountCents)} was refunded to the card in Stripe, but PSS could not record the cancellation.`, "",
      "The job still shows the deposit as paid. Open it and press Cancel & refund again; the card will not be refunded twice.", "",
      `Deposit: ${input.depositId}`,
      `Open in tracker: ${adminOrigin()}/admin/jobs/${input.job.id}?tab=quote`,
    ].join("\n"),
  });
}

/** Cancel & refund (spec §4): the client and the owners are told. Neither failure is thrown. */
export async function sendCancellationEmails(input: { job: Job; amountCents: number; method: DepositMethod; inWindow: boolean; actor: string }): Promise<void> {
  const { job } = input;
  const projectNo = formatProjectNo(job.projectNo) ?? "your project";
  const amount = formatCents(input.amountCents);
  const card = input.method === "stripe";
  const to = normalizeEmail(job.email);
  const sends: Promise<void>[] = [];
  if (to) {
    sends.push(emailClient(to, `Your order ${projectNo} is cancelled`, [
      greeting(job), "",
      `Your order ${projectNo} is cancelled.`,
      card
        ? `Your deposit of ${amount} is being refunded to your card in full. Refunds usually reach your card within 5 to 10 business days.`
        : `We will return your deposit of ${amount} to you in full.`, "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n")));
  }
  sends.push(notifyOwners({
    subject: `Cancelled and refunded: ${projectNo}`,
    text: [
      `${job.name}'s order was cancelled by ${input.actor}.`, "",
      `Deposit:  ${amount} ${card ? "refunded to the card through Stripe" : `(${input.method}) — return it to the client`}`,
      `Cancellation window: ${input.inWindow ? "still open" : "closed"}`, "",
      "The contract is cancelled and the job is Lost.",
      `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}?tab=quote`,
    ].join("\n"),
  }));
  await settle("A cancellation", sends);
}

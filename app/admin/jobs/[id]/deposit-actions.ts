"use server";

import { after } from "next/server";
import { getJob } from "@/lib/admin/jobs";
import { dollarsToCents, formatCents } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/session";
import { inCancellationWindow } from "@/lib/docs/business-days";
import { cancelDeposit, depositState, isRecordedMethod, recordDepositPayment } from "@/lib/payments/deposits";
import { sendCancellationEmails, sendDepositReceipts } from "@/lib/payments/emails";
import { closeCheckout, refundPayment, stripeClient } from "@/lib/payments/stripe";
import { MISSING, refresh } from "../form-state";

/**
 * "Payment received" (spec §4): the owner records a check, cash or other deposit on a Signed job.
 * An open card checkout is closed at Stripe first; if Stripe says the client already paid by card,
 * nothing is recorded (Review Focus 3).
 */
export async function recordDepositAction(jobId: string, amount: string, method: string): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  if (!isRecordedMethod(method)) return { error: "Choose check, cash or other." };
  let amountCents: number | null;
  try {
    amountCents = dollarsToCents(typeof amount === "string" ? amount : "");
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (amountCents === null || amountCents <= 0) return { error: "Enter the amount received." };
  const job = await getJob(jobId);
  if (!job) return MISSING;
  if (job.status !== "signed") return { error: "A deposit is recorded once the contract is signed and before the job is Sold." };
  const state = await depositState(job.id);
  if (!state || state.versionStatus !== "signed") return { error: "This job has no signed contract." };
  if (state.paid) return { error: "The deposit is already recorded." };
  if (amountCents > state.soldCents) return { error: `That is more than the contract total of ${formatCents(state.soldCents)}.` };
  if (state.pending?.stripeSessionId) {
    const closed = await closeCheckout(stripeClient(), state.pending.stripeSessionId);
    if (closed === "paid") return { error: "The client is paying by card right now. Wait for that payment before recording another." };
    if (closed === "unknown") return { error: "Could not check the client's card payment with Stripe. Try again in a minute." };
  }
  const recorded = await recordDepositPayment({ leadId: job.id, versionId: state.versionId, amountCents, method, actor: admin.email });
  if (!recorded) return { error: "The deposit could not be recorded. Reload the page and check the job's stage." };
  after(() => sendDepositReceipts(job.id));
  refresh(job.id);
  return { ok: true };
}

/**
 * "Cancel & refund" (spec §4) on a Signed or Sold job with a paid deposit. A card deposit is refunded
 * in full through Stripe first (one idempotency key per deposit); only then is the cancellation
 * recorded, in one statement. A recorded deposit is marked refunded and the owner returns the money.
 */
export async function cancelDepositAction(jobId: string, depositId: string): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const job = await getJob(jobId);
  if (!job) return MISSING;
  if (job.status !== "signed" && job.status !== "sold") return { error: "Only a Signed or Sold job can be cancelled and refunded here." };
  const state = await depositState(job.id);
  const deposit = state?.paid;
  if (!state || !deposit || deposit.id !== depositId) return { error: "This deposit is no longer paid. Reload the page." };
  if (deposit.method === "stripe") {
    const refunded = deposit.stripePaymentIntentId !== null
      && await refundPayment(stripeClient(), deposit.stripePaymentIntentId, deposit.id);
    if (!refunded) return { error: "Stripe did not refund the card, so nothing was changed. Try again, or refund it in the Stripe dashboard first." };
  }
  if (!(await cancelDeposit({ leadId: job.id, deposit, actor: admin.email }))) {
    return { error: "The cancellation could not be recorded. Reload the page." };
  }
  const inWindow = inCancellationWindow(state.signedAt, new Date());
  after(() => sendCancellationEmails({ job, amountCents: deposit.amountCents, method: deposit.method, inWindow, actor: admin.email }));
  refresh(job.id);
  return { ok: true };
}

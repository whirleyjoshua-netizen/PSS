"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";
import {
  attachSession, claimStripeDeposit, depositState, expireDeposit, expireSessionlessDeposit, expireStaleDeposits, pendingStripeDeposit,
  type Deposit,
} from "@/lib/payments/deposits";
import { closeCheckout, stripeClient } from "@/lib/payments/stripe";
import { portalOrigin } from "@/lib/portal/login";
import { formatProjectNo } from "@/lib/portal/project-no";
import { requireCustomer } from "@/lib/portal/session";

/** "changed": the row was expired or the deposit recorded while the session opened (ruling P15); the page shows the truth. */
export type StartDepositResult = { url: string } | "not-found" | "not-due" | "paid" | "processing" | "unavailable" | "changed";

/** Stripe closes the session this long after the deposit row was created: before expireStaleDeposits' 23-hour cutoff (ruling P11a). */
const CHECKOUT_SECONDS = 22 * 3600;
/** Stripe refuses an expires_at under 30 minutes away; a row closer than this is replaced instead (ruling P14). */
const MIN_REMAINING_SECONDS = 35 * 60;

/**
 * Derived from the row, not the clock (ruling P14), so every tap for one row sends identical parameters
 * under its idempotency key: Stripe refuses a reused key with different parameters.
 */
const checkoutExpiresAt = (deposit: Deposit): number => Math.floor(deposit.createdAt.getTime() / 1000) + CHECKOUT_SECONDS;

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/**
 * One deposit row, one Checkout Session: the same row always produces the same parameters. Cards only
 * (Apple Pay and Google Pay arrive as cards), and the session expires 22 hours after the row was created,
 * so a row the 23-hour stale cutoff gives up has no payable session left.
 */
function checkoutParams(job: { id: string; projectNo?: number | null }, email: string, deposit: Deposit): Stripe.Checkout.SessionCreateParams {
  const origin = portalOrigin();
  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  return {
    mode: "payment",
    customer_email: email,
    payment_method_types: ["card"],
    expires_at: checkoutExpiresAt(deposit),
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: deposit.amountCents, product_data: { name: `50% deposit — ${projectNo}` } } }],
    metadata: { depositId: deposit.id, leadId: job.id },
    payment_intent_data: { metadata: { depositId: deposit.id, leadId: job.id } },
    success_url: `${origin}/project/${job.id}?deposit=done`,
    cancel_url: `${origin}/project/${job.id}`,
  };
}

/**
 * Opens (or re-opens) Stripe Checkout for the 50% deposit (spec §4).
 *
 * Settled server-side, none of it from the request: ownership (the session's own jobs), the stage
 * (Signed), the amount (the signed version's stored total, checked again in the claim statement) and
 * that nothing is paid. Paying is never believed here: only the verified webhook marks it paid.
 *
 * A second tap, a back button or a double click lands on the same checkout (Review Focus 2): the
 * pending row is claimed in one statement, its id is the idempotency key of the Session, and an
 * existing Session is re-read rather than re-created.
 */
export async function startDepositAction(jobId: string): Promise<StartDepositResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  const state = await depositState(job.id);
  if (state?.paid) return "paid";
  if (job.status !== "signed" || !state || state.versionStatus !== "signed" || state.jobStatus !== "signed") return "not-due";
  const stripe = stripeClient();
  if (!stripe) return "unavailable";

  await expireStaleDeposits(state.versionId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deposit = (await claimStripeDeposit({ leadId: job.id, versionId: state.versionId, amountCents: state.amountCents }))
      ?? (await pendingStripeDeposit(state.versionId));
    if (!deposit) return "not-due";
    // A row that never got a session and is too old for one to open: give it up and claim a fresh one.
    if (!deposit.stripeSessionId && checkoutExpiresAt(deposit) < Math.floor(Date.now() / 1000) + MIN_REMAINING_SECONDS) {
      await expireSessionlessDeposit(deposit.id);
      continue;
    }
    let session: Stripe.Checkout.Session;
    try {
      session = deposit.stripeSessionId
        ? await stripe.checkout.sessions.retrieve(deposit.stripeSessionId)
        : await stripe.checkout.sessions.create(checkoutParams(job, email, deposit), { idempotencyKey: `deposit-${deposit.id}` });
    } catch (error) {
      console.error(`Could not open card checkout for deposit ${deposit.id}`, error);
      return "unavailable";
    }
    if (session.status === "complete") return "processing";
    if (session.status === "open" && session.url) {
      if (await attachSession(deposit.id, session.id)) return { url: session.url };
      // Ruling P15: the row stopped being pending meanwhile (expired, or the owner recorded the deposit).
      // Close this session so it can never take a second payment, and send the client nowhere near it.
      try {
        await closeCheckout(stripe, session.id);
      } catch (error) {
        console.error(`Could not close Checkout Session ${session.id}`, error);
      }
      return "changed";
    }
    // Expired at Stripe: give the row up and claim a fresh one.
    await expireDeposit(session.id);
  }
  return "unavailable";
}

/** The form's wrapper: to Stripe, or back to the project page with the outcome as a hint only. */
export async function startDepositFormAction(formData: FormData): Promise<void> {
  const jobId = text(formData.get("jobId"));
  const result = await startDepositAction(jobId);
  // Outside any try/catch: redirect() works by throwing.
  if (typeof result === "object") redirect(result.url);
  if (result === "changed") redirect(`/project/${encodeURIComponent(jobId)}`);
  redirect(`/project/${encodeURIComponent(jobId)}?deposit=${result}`);
}

import "server-only";
import Stripe from "stripe";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * The test-only API override (e2e's stub, e2e/fixtures/stripe-stub.ts). Honoured only on this machine,
 * as ROUTE_OPTIMIZATION_URL is, so a stray variable can never send a payment elsewhere.
 */
export function stripeApiOverride(): { host: string; port: number; protocol: "http" | "https" } | null {
  const raw = process.env.STRIPE_API_URL;
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error("Ignoring STRIPE_API_URL: it is not a URL");
    return null;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    console.error("Ignoring STRIPE_API_URL: only 127.0.0.1 or localhost is allowed");
    return null;
  }
  const protocol = url.protocol === "https:" ? "https" : "http";
  return { host: url.hostname, port: Number(url.port || (protocol === "https" ? 443 : 80)), protocol };
}

/** The server SDK, or null when STRIPE_SECRET_KEY is not set. Network errors and 409 conflicts are retried twice. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { maxNetworkRetries: 2, ...(stripeApiOverride() ?? {}) });
}

/**
 * Verifies a webhook body against its Stripe-Signature header with STRIPE_WEBHOOK_SECRET and answers the
 * event. Throws when it does not verify, and when the secret is not set (then nothing verifies).
 * Verification needs no API key; a placeholder is used when none is set.
 */
export function verifyWebhook(body: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_verification_only");
  return stripe.webhooks.constructEvent(body, signature ?? "", secret);
}

/**
 * Closes the client's card checkout before an owner records a deposit by hand (Review Focus 3).
 * "paid": Stripe says it completed, so a card payment is in flight — record nothing. "closed": it is
 * expired now, or was. "unknown": Stripe could not be asked, or refused to expire it because it
 * completed meanwhile — the owner tries again and then reads "paid".
 */
export async function closeCheckout(stripe: Stripe | null, sessionId: string): Promise<"closed" | "paid" | "unknown"> {
  if (!stripe) return "unknown";
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "complete") return "paid";
    if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
    return "closed";
  } catch (error) {
    console.error(`Could not close Checkout Session ${sessionId}`, error);
    return "unknown";
  }
}

/** Refunds a card deposit in full. One idempotency key per deposit, so a second press refunds nothing more. */
export async function refundPayment(stripe: Stripe | null, paymentIntentId: string, depositId: string): Promise<boolean> {
  if (!stripe) return false;
  try {
    await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-${depositId}` });
    return true;
  } catch (error) {
    console.error(`Stripe did not refund ${paymentIntentId}`, error);
    return false;
  }
}

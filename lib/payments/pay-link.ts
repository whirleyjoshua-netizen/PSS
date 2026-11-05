import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { portalOrigin } from "@/lib/portal/login";

/**
 * The deposit payment link (owner 2026-11-04): /pay/<job id>/<signature>, for a client who can't manage the
 * project page. It opens a page with one Pay by card button, with no sign-in, and the owner opens the same
 * page to type a card in while on the phone.
 *
 * The signature is an HMAC of the job id, keyed off STRIPE_SECRET_KEY, so no new secret or table is needed:
 * without that key no card can be taken anyway. Changing the key (test to live) retires every old link, which
 * then says to call us. The link only ever lets someone PAY this job's deposit, at the amount on record.
 */
const DOMAIN = "pss-deposit-pay-link-v1";
const SIGNATURE = /^[A-Za-z0-9_-]{22}$/;

function key(): string | null {
  const secret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  return secret ? `${DOMAIN}:${secret}` : null;
}

function sign(jobId: string, secret: string): string {
  return createHmac("sha256", secret).update(jobId).digest("base64url").slice(0, 22);
}

/** The path, or null when card payments are not set up. */
export function payPath(jobId: string): string | null {
  const secret = key();
  return secret ? `/pay/${jobId}/${sign(jobId, secret)}` : null;
}

/** The full link the owner copies, emails or opens. Null when card payments are not set up. */
export function payLink(jobId: string): string | null {
  const path = payPath(jobId);
  return path ? `${portalOrigin()}${path}` : null;
}

/** Whether a link's signature belongs to this job id. Constant-time; any malformed input is simply false. */
export function verifyPayLink(jobId: string, signature: string): boolean {
  const secret = key();
  if (!secret || !SIGNATURE.test(signature)) return false;
  const expected = Buffer.from(sign(jobId, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

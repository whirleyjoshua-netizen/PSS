"use server";

import { redirect } from "next/navigation";
import { getJob } from "@/lib/admin/jobs";
import { isUuid } from "@/lib/admin/ids";
import { openDepositCheckout } from "@/lib/payments/checkout";
import { verifyPayLink } from "@/lib/payments/pay-link";

/**
 * The pay page's Pay by card button (owner 2026-11-04). The job id and signature arrive bound from the page,
 * which a client can alter, so the signature is checked again here; the stage and the amount are settled
 * inside openDepositCheckout, never taken from the request.
 */
export async function payFromLinkAction(jobId: string, sig: string): Promise<void> {
  const page = `/pay/${encodeURIComponent(jobId)}/${encodeURIComponent(sig)}`;
  const job = isUuid(jobId) && verifyPayLink(jobId, sig) ? await getJob(jobId) : null;
  if (!job) redirect(page);
  const result = await openDepositCheckout(job);
  // Outside any try/catch: redirect() works by throwing.
  if (typeof result === "object") redirect(result.url);
  if (result === "changed") redirect(page);
  redirect(`${page}?status=${result}`);
}

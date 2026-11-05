"use server";

import { redirect } from "next/navigation";
import { openDepositCheckout, type StartDepositResult } from "@/lib/payments/checkout";
import { requireCustomer } from "@/lib/portal/session";

export type { StartDepositResult } from "@/lib/payments/checkout";

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/** The client's Pay deposit button on their project page: only a job the signed-in client can see. */
export async function startDepositAction(jobId: string): Promise<StartDepositResult> {
  const { jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  return openDepositCheckout(job);
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sendMessage, type MessageResult } from "@/lib/portal/messages";
import { notifyOwnersOfMessage } from "@/lib/portal/send-message-email";
import { destroyCustomerSession, requireCustomer } from "@/lib/portal/session";

export async function signOutCustomer(): Promise<void> {
  await destroyCustomerSession();
  redirect("/project/sign-in");
}

/**
 * Sends one message about one job.
 *
 * The jobs are re-derived from the session on every call and a jobId that is not among them
 * is refused with exactly the answer a job that does not exist gets — the caller learns
 * nothing about what exists. Nothing is read or written before that check passes.
 */
export async function sendCustomerMessage(jobId: string, body: string): Promise<MessageResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";

  const result = await sendMessage(jobId, body, email);
  if (result !== "sent") return result;

  // The event row is already written by this point, so a failed email costs only the
  // notification. after() keeps it off the response, and the catch keeps it off the customer.
  after(() => {
    void notifyOwnersOfMessage(job, body, email).catch(console.error);
  });

  // Both paths render the same view: /project renders ProjectView directly for a customer
  // with a single job, so revalidating only the [jobId] path would leave the common case stale.
  revalidatePath("/project");
  revalidatePath(`/project/${jobId}`);
  return result;
}

export type MessageFormState = { status: "idle" | MessageResult; text?: string; sent?: number };

/** The useActionState wrapper. The form posts and works identically with JavaScript off. */
export async function sendMessageAction(
  previous: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const jobId = String(formData.get("jobId") ?? "");
  const text = String(formData.get("body") ?? "");
  const status = await sendCustomerMessage(jobId, text);

  // The text comes back only when it is still in play, so a sent message leaves an empty box.
  return status === "sent"
    ? { status, sent: (previous.sent ?? 0) + 1 }
    : { status, text, sent: previous.sent };
}

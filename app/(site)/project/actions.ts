"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { isInstalled } from "@/lib/admin/stages";
import { sendMessage, type MessageResult } from "@/lib/portal/messages";
import { notifyOwnersOfMessage } from "@/lib/portal/send-message-email";
import { requestService } from "@/lib/portal/service-request";
import { serviceRequestSchema } from "@/lib/portal/service-schema";
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

export type ServiceFormState = {
  status: "idle" | "not-found" | "invalid";
  /** Field name → message, so nothing a customer typed is lost to a no-JS post. */
  errors?: Record<string, string>;
  values?: { windowId?: string; windowText?: string; issue?: string; details?: string };
};

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/**
 * Files one service request against one job.
 *
 * Ownership is settled before anything else is read or parsed: a jobId that is not among the
 * caller's own jobs is refused with exactly the answer a job that does not exist gets, and so
 * is a job whose work is not installed. requestService() checks both again — this wrapper is
 * the form's, not the guard.
 *
 * A successful request lands the customer back on their project page, where the after-work
 * section now says when they asked. The photo never comes back: re-choosing a file is the one
 * thing a browser will not do for us, and the request itself has already been made.
 */
export async function requestServiceAction(
  _previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const jobId = text(formData.get("jobId"));
  const { jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job || !isInstalled(job.status)) return { status: "not-found" };

  const values = {
    windowId: text(formData.get("windowId")),
    windowText: text(formData.get("windowText")),
    issue: text(formData.get("issue")),
    details: text(formData.get("details")),
  };
  const parsed = serviceRequestSchema.safeParse({
    windowId: values.windowId || undefined,
    windowText: values.windowText || undefined,
    issue: values.issue,
    details: values.details || undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "windowText");
      errors[field] ??= issue.message;
    }
    return { status: "invalid", errors, values };
  }

  const photo = formData.get("photo");
  const result = await requestService(jobId, {
    ...parsed.data,
    photo: photo instanceof File ? photo : null,
  });
  if (result !== "created") return { status: "not-found" };

  // Both paths render the same view: /project renders ProjectView directly for a customer
  // with a single job, so revalidating only the [jobId] path would leave the common case stale.
  revalidatePath("/project");
  revalidatePath(`/project/${jobId}`);
  // Outside any try/catch: redirect() works by throwing.
  redirect(`/project/${jobId}`);
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

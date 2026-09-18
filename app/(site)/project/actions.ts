"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { listSharedDocuments } from "@/lib/admin/files";
import { setStage } from "@/lib/admin/jobs";
import { isInstalled } from "@/lib/admin/stages";
import { approveQuote, type ApproveResult } from "@/lib/portal/approve";
import { sendMessage, type MessageResult } from "@/lib/portal/messages";
import { notifyOwnersOfAcknowledgement } from "@/lib/portal/send-acknowledgement-email";
import { notifyOwnersOfApproval } from "@/lib/portal/send-approval-email";
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
 *
 * `fromAcknowledgement` is a PARAMETER of this private function, supplied by whichever of the
 * two exported wrappers below the form was given. It is never read from `formData`: a field is
 * something a crafted post can assert, and asserting this one mutes the owners' review email.
 * Only the route the customer actually came through can set it.
 */
async function fileServiceRequest(
  _previous: ServiceFormState,
  formData: FormData,
  fromAcknowledgement: boolean,
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
  const result = await requestService(
    jobId,
    { ...parsed.data, photo: photo instanceof File ? photo : null },
    { fromAcknowledgement },
  );
  // A window that is not one of this job's, with nothing typed instead: the page was stale or
  // the id was tampered with. Asking again keeps every other answer they gave.
  if (result.status === "unknown-window") {
    return { status: "invalid", errors: { windowText: "Tell us which window" }, values };
  }
  if (result.status !== "created") return { status: "not-found" };

  // Both paths render the same view: /project renders ProjectView directly for a customer
  // with a single job, so revalidating only the [jobId] path would leave the common case stale.
  revalidatePath("/project");
  revalidatePath(`/project/${jobId}`);
  // The new project number rides back on the URL so the confirmation can name it — it is the
  // reference the customer quotes when they call about the repair.
  const confirmation = result.projectNo ? `?requested=${encodeURIComponent(result.projectNo)}` : "";
  // Outside any try/catch: redirect() works by throwing.
  redirect(`/project/${jobId}${confirmation}`);
}

/** An ordinary service request, from the "Request a service" link. Nothing is muted. */
export async function requestServiceAction(
  previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  return fileServiceRequest(previous, formData, false);
}

/**
 * The unhappy half of the installation acknowledgement: "Something is not right".
 *
 * Identical to an ordinary request except that it also mutes the job's review request — the
 * customer has just told us the work is wrong, and the review cron would otherwise ask them
 * for a public review within 14 days (spec §5). The job does NOT move: it stays installed
 * until the owners have put it right.
 *
 * This is a separate action, rather than a flag on the other one, because that is what keeps
 * provenance out of the post: there is no field a crafted submission could set to reach it.
 *
 * That is not the same as being unreachable. Like every server action this one is directly
 * postable, and the `?from=acknowledgement` marker that leads a form to it is not a secret —
 * any customer can type it. The weight is carried by the gate, not by obscurity:
 * fileServiceRequest settles ownership and the installed status before anything is parsed, so
 * the only review anyone can mute here is one on their own installed job, which is exactly
 * what the visible button does anyway.
 */
export async function acknowledgeProblemAction(
  previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  return fileServiceRequest(previous, formData, true);
}

/**
 * Records that a customer approved their quote, moving their job to Sold.
 *
 * This is the most consequential thing a customer can do in this app: the owners order
 * materials against it. Three things are therefore settled server-side, in this order, and
 * none of them is taken from the request.
 *
 * 1. Ownership. The jobs are re-derived from the session on every call and a jobId that is
 *    not among them is refused with exactly the answer a job that does not exist gets — the
 *    caller learns nothing about what exists, and nothing is read or written before it passes.
 * 2. The status. A customer may cause exactly one transition, quoted → sold. The target
 *    status is a literal here; it never arrives from the browser.
 * 3. A shared quote. Approving something the customer cannot read is not consent, so the
 *    document is looked up here rather than trusted from the post. The page hides the control
 *    when there is no quote, but that is a UI nicety — this is the guard, and the name written
 *    into the timeline is the shared document's own, not a string the browser supplied.
 */
export async function approveQuoteAction(jobId: string): Promise<ApproveResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  // A job already at the destination is an approval that already happened, so it answers with
  // the same success the first submission did (spec §4). It is also the honest answer: the job
  // is sold, which is what they asked for. Nothing runs past here — no second email, no
  // revalidation — because nothing changes.
  if (job.status === "sold") return "approved";
  if (job.status !== "quoted") return "wrong-status";

  const documents = await listSharedDocuments(job.id);
  const quote = documents.find((file) => file.docType === "quote");
  if (!quote) return "no-quote";

  const result = await approveQuote(job.id, email, quote.name);
  if (result !== "approved") return result;

  // The job has already moved by this point, so a failed email costs only the notification.
  // after() keeps it off the response, and the catch keeps it off the customer.
  after(() => {
    void notifyOwnersOfApproval(job, quote.name, email).catch(console.error);
  });

  // Both paths render the same view: /project renders ProjectView directly for a customer
  // with a single job, so revalidating only the [jobId] path would leave the common case stale.
  revalidatePath("/project");
  revalidatePath(`/project/${job.id}`);
  return result;
}

/**
 * The form's wrapper. The post carries only the job id — every other fact is re-derived.
 *
 * Approving is the most consequential thing a customer can do here, so it must not answer in
 * silence: a page that merely re-rendered would leave them unable to tell a recorded approval
 * from one that was refused. The outcome therefore rides back on the URL, the same mechanism
 * `?requested=` already uses on this page, which keeps the whole path working with JavaScript
 * off — a plain form post and a redirect, no client state.
 *
 * The flag is a hint for the page, never the truth: it is the customer's own browser that will
 * send it back, so the page re-derives what to say from the job's real status.
 */
export async function approveQuoteFormAction(formData: FormData): Promise<void> {
  const jobId = text(formData.get("jobId"));
  const result = await approveQuoteAction(jobId);
  // Outside any try/catch: redirect() works by throwing.
  redirect(`/project/${encodeURIComponent(jobId)}?approved=${result === "approved" ? "1" : "no"}`);
}

/** What acknowledging can answer. Every refusal is a plain outcome, never an exception. */
export type AcknowledgeResult = "acknowledged" | "not-found" | "wrong-status";

/**
 * Records that a customer confirmed their installation is right, completing the job.
 *
 * The same three rules as approving, in the same order, and none of them taken from the
 * request:
 *
 * 1. Ownership. The jobs are re-derived from the session on every call and a jobId that is not
 *    among them is refused with exactly the answer a job that does not exist gets. Nothing is
 *    read or written before it passes — the shortcut below sits AFTER this refusal, never
 *    before it, or a stranger's id would learn whether a completed job exists.
 * 2. The status. A customer may cause exactly one transition here, installed → completed. The
 *    target is a literal; it never arrives from the browser.
 * 3. The move is setStage's single statement, so the status change and the timeline sentence
 *    an owner reads back in six months cannot come apart.
 *
 * Note the options are a NAMED object. Passed positionally, setStage silently discards the
 * body and the timeline records a bare status change with nothing to explain it.
 */
export async function acknowledgeInstallAction(jobId: string): Promise<AcknowledgeResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  // A job already completed is a question already answered, so it gets the same success the
  // first tap did — and it is the honest answer, because the job really is complete. Nothing
  // runs past here: no second email, no revalidation of a page nothing changed on.
  if (job.status === "completed") return "acknowledged";
  if (job.status !== "installed") return "wrong-status";

  // The customer's own address is the actor: this is their act, not an owner's.
  const moved = await setStage(jobId, "completed", email, {
    body: "Confirmed the installation from their project page",
  });
  // Never "not-found": the caller has already established the job is one of the customer's
  // own, so a declined move can only mean it was not in the status this transition starts
  // from. Answering not-found for a job that plainly exists would put a lie on the page.
  if (!moved) return "wrong-status";

  // The job has already moved by this point, so a failed email costs only the notification.
  // after() keeps it off the response, and the catch keeps it off the customer (spec §7).
  after(() => {
    void notifyOwnersOfAcknowledgement(job, email).catch(console.error);
  });

  // Both paths render the same view: /project renders ProjectView directly for a customer
  // with a single job, so revalidating only the [jobId] path would leave the common case stale.
  revalidatePath("/project");
  revalidatePath(`/project/${jobId}`);
  return "acknowledged";
}

/**
 * The form's wrapper. The post carries only the job id — every other fact is re-derived.
 *
 * The outcome rides back on the URL, as `?approved=` and `?requested=` already do here, so the
 * whole path works with JavaScript off. The flag is a hint for the page and never the truth:
 * it is the customer's own browser that sends it back, so AcknowledgeNotice re-derives what to
 * say from the job's real status.
 */
export async function acknowledgeInstallFormAction(formData: FormData): Promise<void> {
  const jobId = text(formData.get("jobId"));
  const result = await acknowledgeInstallAction(jobId);
  // Outside any try/catch: redirect() works by throwing.
  redirect(
    `/project/${encodeURIComponent(jobId)}?acknowledged=${result === "acknowledged" ? "1" : "no"}`,
  );
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

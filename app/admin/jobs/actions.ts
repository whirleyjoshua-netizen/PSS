"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { syncJobCalendar } from "@/lib/calendar/sync";
import { requireAdmin } from "@/lib/admin/session";
import { geocodeLead } from "@/lib/routes/geocode";
import { addNote, assignJob, createJob, getJob, setStage, updateDetails } from "@/lib/admin/jobs";
import { detailsSchema, handJobSchema, lostSchema, noteSchema } from "@/lib/admin/schema";
import { isInstalled, type Stage } from "@/lib/admin/stages";
import { autoInvite, sendPortalInvite } from "@/lib/portal/invite";
import { isPortalStatus } from "@/lib/portal/progress";
import { ensureReferralCode, markReferralPaid } from "@/lib/referrals/db";
import { releaseReview, restoreReviewRequested, setReviewOptOut, stampReviewRequested } from "@/lib/reviews/db";
import { sendReviewRequest } from "@/lib/reviews/send";
import { captureValues, MISSING, refresh, type FormState } from "./form-state";

// The form helpers live in ./form-state so the appointment actions share one FormState shape.
// Re-exported here because every form in the admin imports the type from this module.
export type { FormState };

// Every action calls requireAdmin() before reading its input.

// Outlook follows the tracker's dates; syncJobCalendar never throws and is a no-op until Outlook is set up.
// A stage move changes no date, so it pushes nothing: Lost still removes events and a reopened job gets them back.
export async function moveStage(id: string, to: Stage): Promise<void> {
  const { email } = await requireAdmin();
  const changed = await setStage(id, to, email);
  // After the consultation, the customer gets their project page. autoInvite
  // sends at most once per job and never throws.
  if (changed && isPortalStatus(to)) after(() => autoInvite(id));
  if (changed) after(() => syncJobCalendar(id));
  refresh(id);
}

export async function markLost(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["reason"]);
  const parsed = lostSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const changed = await setStage(id, "lost", email, parsed.data.reason);
  if (!changed) return MISSING;
  after(() => syncJobCalendar(id));
  refresh(id);
  return { ok: true };
}

export async function saveDetails(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, [
    "address", "city", "brands", "orderedOn", "budget",
    "windowCountExact", "treatmentTypes", "motorized", "gateCode",
  ]);
  const parsed = detailsSchema.safeParse({
    address: formData.get("address") ?? "",
    city: formData.get("city") ?? "",
    brands: formData.getAll("brands"),
    orderedOn: formData.get("orderedOn") ?? "",
    budget: formData.get("budget") ?? "",
    windowCountExact: formData.get("windowCountExact") ?? "",
    treatmentTypes: formData.getAll("treatmentTypes").map(String),
    motorized: formData.get("motorized") === "on",
    gateCode: formData.get("gateCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  // No date is edited here any more, so this save never touches Outlook.
  const { saved, addressChanged } = await updateDetails(id, parsed.data, email);
  if (!saved) return MISSING;
  // Coordinates for the route planner, only when the address really changed. Never blocks the save.
  if (addressChanged) after(() => geocodeLead(id));
  refresh(id);
  return { ok: true };
}

export async function saveNote(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = noteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const logged = await addNote(id, parsed.data.body, email);
  if (!logged) return MISSING;
  refresh(id);
  return { ok: true };
}

export async function addJob(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["name", "phone", "email", "city", "address", "source", "notes", "stage"]);
  // handJobSchema, not newJobSchema: "service" belongs to the customer's own request, never to this form.
  const parsed = handJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const id = await createJob(parsed.data, email);
  revalidatePath("/admin");
  redirect(`/admin/jobs/${id}`);
}

export async function sendReviewNow(id: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const job = await getJob(id);
  if (!job) return MISSING;
  if (!job.email) return { error: "This job has no email address." };
  if (job.reviewOptOut) return { error: "Review requests are turned off for this job." };
  // The email thanks the customer for the installation, so never send it early.
  if (!isInstalled(job.status)) return { error: "Review requests go out once the job is installed." };
  // Stamped before sending, so a crash after the email goes out never leaves
  // the job eligible for tomorrow's cron too.
  const stamped = await stampReviewRequested(id);
  try {
    await sendReviewRequest(job, email);
  } catch (error) {
    console.error("Review request failed", error);
    if (stamped) {
      if (stamped.previous === null) await releaseReview(id);
      else await restoreReviewRequested(id, stamped.previous);
    }
    return { error: "Could not send the review request. Check the settings and try again." };
  }
  refresh(id);
  return { ok: true };
}

export async function saveReviewOptOut(id: string, optOut: boolean): Promise<void> {
  const { email } = await requireAdmin();
  await setReviewOptOut(id, optOut, email);
  refresh(id);
}

export async function createReferralLink(id: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  await requireAdmin();
  const code = await ensureReferralCode(id);
  if (!code) return MISSING;
  refresh(id);
  return { ok: true };
}

export async function sendPortalInviteNow(id: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const job = await getJob(id);
  if (!job) return MISSING;
  if (!job.email?.trim()) return { error: "This job has no email address." };
  if (!isPortalStatus(job.status)) return { error: "Customers can be invited once the job is Quoted." };
  try {
    await sendPortalInvite(job, email);
  } catch (error) {
    console.error("Portal invite failed", error);
    return { error: "Could not send the invite. Check the settings and try again." };
  }
  refresh(id);
  return { ok: true };
}

/** An empty choice unassigns. An assignment that changed nothing is still a success. */
export async function assignJobAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const raw = formData.get("assignedTo");
  const memberId = typeof raw === "string" && raw !== "" ? raw : null;
  const result = await assignJob(id, memberId, email);
  if (result === "missing") return MISSING;
  if (result === "unknown-member") return { error: "That person is no longer on the team." };
  refresh(id);
  return { ok: true };
}

export async function payReferral(
  referredId: string, referrerId: string, _prev: FormState, _formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const paid = await markReferralPaid(referredId, email);
  if (!paid) return { error: "That reward is not owed yet, or it was already paid." };
  refresh(referrerId);
  refresh(referredId);
  return { ok: true };
}

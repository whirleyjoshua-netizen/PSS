"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { Kind } from "@/lib/calendar/events";
import { syncJobCalendar } from "@/lib/calendar/sync";
import { requireAdmin } from "@/lib/admin/session";
import { addNote, createJob, getJob, setStage, updateDetails } from "@/lib/admin/jobs";
import { detailsSchema, lostSchema, newJobSchema, noteSchema } from "@/lib/admin/schema";
import { isInstalled, type Stage } from "@/lib/admin/stages";
import { autoInvite, sendPortalInvite } from "@/lib/portal/invite";
import { isPortalStatus } from "@/lib/portal/progress";
import { ensureReferralCode, markReferralPaid } from "@/lib/referrals/db";
import { releaseReview, restoreReviewRequested, setReviewOptOut, stampReviewRequested } from "@/lib/reviews/db";
import { sendReviewRequest } from "@/lib/reviews/send";

export type FormState = {
  error?: string;
  ok?: boolean;
  /** The submitted values, echoed back so a failed submit can keep them. */
  values?: Record<string, string | string[]>;
};

const MISSING: FormState = { error: "That job no longer exists." };

const refresh = (id: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${id}`);
};

/** Captures a FormData's entries so a failed submit can restore them as defaults. */
function captureValues(formData: FormData, keys: string[]): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of keys) {
    const all = formData.getAll(key);
    if (all.length === 0) continue;
    values[key] = all.length > 1 ? all.map(String) : String(all[0]);
  }
  return values;
}

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
    "visitAt", "quote", "sold", "deposit", "brands", "orderedOn", "installOn", "budget",
    "windowCountExact", "treatmentTypes", "motorized", "gateCode",
  ]);
  const parsed = detailsSchema.safeParse({
    visitAt: formData.get("visitAt") ?? "",
    quote: formData.get("quote") ?? "",
    sold: formData.get("sold") ?? "",
    deposit: formData.get("deposit") ?? "",
    brands: formData.getAll("brands"),
    orderedOn: formData.get("orderedOn") ?? "",
    installOn: formData.get("installOn") ?? "",
    budget: formData.get("budget") ?? "",
    windowCountExact: formData.get("windowCountExact") ?? "",
    treatmentTypes: formData.getAll("treatmentTypes").map(String),
    motorized: formData.get("motorized") === "on",
    gateCode: formData.get("gateCode") ?? "",
    visitAtLoaded: formData.get("visitAtLoaded") ?? undefined,
    installOnLoaded: formData.get("installOnLoaded") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const result = await updateDetails(id, parsed.data, email);
  if (!result) return MISSING;
  // Only a date this save changed overrides Outlook; the rest keep any move made there.
  const pushKinds: Kind[] = [];
  if (result.visitChanged) pushKinds.push("visit");
  if (result.installChanged) pushKinds.push("install");
  after(() => syncJobCalendar(id, pushKinds));
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
  const parsed = newJobSchema.safeParse(Object.fromEntries(formData));
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

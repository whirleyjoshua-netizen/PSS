"use server";

import { after } from "next/server";
import {
  cancelAppointment, confirmAppointment, logAppointmentEmail, logConfirmation, mirrorToJob, saveAppointment,
} from "@/lib/admin/appointments";
import { getJob, setStage } from "@/lib/admin/jobs";
import { appointmentSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import { sendAppointmentConfirmation } from "@/lib/appointments/send";
import { syncJobCalendar } from "@/lib/calendar/sync";
import { captureValues, MISSING, refresh, type FormState } from "./form-state";

const GONE: FormState = { error: "That appointment no longer exists." };

// Every action calls requireAdmin() before reading its input.

/**
 * Books or moves one appointment. It is saved pending, so nothing reaches Outlook or the customer
 * here — only confirmSchedule does that. The mirror still runs: a re-booked appointment loses its
 * confirmation, and leads.visit_at must lose the date with it.
 */
export async function bookAppointment(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["kind", "startsAt", "allDay"]);
  const parsed = appointmentSchema.safeParse({
    kind: formData.get("kind") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    allDay: formData.get("allDay") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const saved = await saveAppointment(jobId, parsed.data.kind, parsed.data.startsAt, parsed.data.allDay, email);
  if (saved === "missing") return MISSING;
  await mirrorToJob(jobId);
  refresh(jobId);
  return { ok: true };
}

/**
 * The owner's "Confirm schedule": the point where an appointment becomes a promise. It mirrors to the
 * job first, so the Outlook sync and the Schedule page both read the new date, then tells the customer.
 * A failed email never unwinds the confirmation — the appointment is booked either way, and the owner
 * is told so they can reach out by hand.
 */
export async function confirmSchedule(appointmentId: string, jobId: string): Promise<FormState> {
  const { email } = await requireAdmin();
  const confirmed = await confirmAppointment(appointmentId, email);
  if (confirmed === "missing") return GONE;
  // Confirming twice is a repeat press, not a reason to email the customer again.
  if (confirmed === "already") return { ok: true };

  // mirrorToJob before the sync: confirmAppointment stamps the row only, and the calendar and the
  // job page both read leads.visit_at / leads.install_on.
  await mirrorToJob(jobId);
  await logConfirmation(confirmed, email);

  const job = await getJob(jobId);
  // Booking the consultation is what moves a new lead along; the later kinds follow their own stages.
  if (confirmed.kind === "consultation" && job?.status === "new") await setStage(jobId, "visit_booked", email);
  after(() => syncJobCalendar(jobId, [confirmed.kind]));

  let error: string | undefined;
  // The confirmation stands either way; these only explain why no email went out.
  if (!job) error = MISSING.error;
  else if (!job.email) error = "This job has no email address.";
  else {
    try {
      await sendAppointmentConfirmation(job, confirmed);
      await logAppointmentEmail(jobId, job.email, email);
    } catch (sendError) {
      console.error("Appointment confirmation email failed", sendError);
      error = "Confirmed, but the email could not be sent.";
    }
  }
  refresh(jobId);
  return error ? { error } : { ok: true };
}

/** Removes the appointment. The mirror clears the job's date and the sync removes the Outlook event. */
export async function cancelAppointmentAction(appointmentId: string, jobId: string): Promise<FormState> {
  const { email } = await requireAdmin();
  const cancelled = await cancelAppointment(appointmentId, email);
  if (cancelled === "missing") return GONE;
  await mirrorToJob(jobId);
  // The tracker wins for this kind, so the event goes even if it was moved in Outlook.
  after(() => syncJobCalendar(jobId, [cancelled.kind]));
  refresh(jobId);
  return { ok: true };
}

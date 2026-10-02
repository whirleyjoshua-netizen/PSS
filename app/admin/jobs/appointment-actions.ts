"use server";

import { after } from "next/server";
import {
  cancelAppointment, confirmAppointment, logAppointmentEmail, logAppointmentProblem, logConfirmation,
  mirrorToJob, saveAppointment, setAppointmentNotes, type AppointmentDetails,
} from "@/lib/admin/appointments";
import { getJob, setStage } from "@/lib/admin/jobs";
import { appointmentNotesSchema, appointmentSchema } from "@/lib/admin/schema";
import { gateCodeField } from "@/lib/leads/questionnaire-schema";
import { requireAdmin } from "@/lib/admin/session";
import { sendAppointmentConfirmation } from "@/lib/appointments/send";
import { syncJobCalendar } from "@/lib/calendar/sync";
import { captureValues, MISSING, refresh, type FormState } from "./form-state";

const GONE: FormState = { error: "That appointment no longer exists." };

/**
 * A form that does not carry the gate code field leaves the client's gate code alone; one that
 * carries it blank clears it. The dialogs show the field only when they were given the client's code,
 * and send gateCodeWas, the code the page loaded: a gate code that was not changed in the dialog is
 * left alone, so a stale page never reverts a newer code (and a notes-only save writes nothing to the
 * client). A form without gateCodeWas (an older page) saves the field as sent.
 */
function details(formData: FormData, designerNotes: string | null, gateCode: string | null): AppointmentDetails {
  if (!formData.has("gateCode")) return { designerNotes };
  if (formData.has("gateCodeWas")) {
    const was = gateCodeField.safeParse(formData.get("gateCodeWas"));
    if (was.success && was.data === gateCode) return { designerNotes };
  }
  return { designerNotes, gateCode };
}

// Every action calls requireAdmin() before reading its input.

/**
 * Books or moves one appointment. It is saved pending, so the customer is not told here — only
 * confirmSchedule does that. The mirror still runs: a re-booked appointment loses its confirmation,
 * and leads.visit_at must lose the date with it. The sync runs for the same reason: rescheduling a
 * confirmed appointment un-confirms it, and an unconfirmed appointment must come OFF the shared
 * calendar at once. With no confirmed row left, the sync finds nothing wanted for this kind and
 * deletes the stale event, rather than leaving the old time on the calendar until the daily cron.
 * The designer notes and a changed gate code are saved in the same statement; the sync reconciles
 * every kind, so a new gate code also reaches the job's other confirmed events.
 */
export async function bookAppointment(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["kind", "startsAt", "allDay", "windowStart", "windowEnd", "hours", "gateCode", "designerNotes"]);
  const parsed = appointmentSchema.safeParse({
    kind: formData.get("kind") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    allDay: formData.get("allDay") === "on",
    windowStart: formData.get("windowStart") ?? "",
    windowEnd: formData.get("windowEnd") ?? "",
    hours: formData.get("hours") ?? "",
    designerNotes: formData.get("designerNotes") ?? "",
    gateCode: formData.get("gateCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { kind, startsAt, allDay, windowStart, windowEnd, durationMinutes, designerNotes, gateCode } = parsed.data;
  // The notes are that appointment's own only when this is its Reschedule (notesFor names its kind):
  // then they win, even cleared. Any other booking onto a kind that already has notes keeps them
  // unless it typed new ones, so a plain Schedule or a switched kind never silently wipes them.
  const ownNotes = formData.get("notesFor") === kind;
  const saved = await saveAppointment(
    jobId, kind, startsAt, allDay, { windowStart, windowEnd, durationMinutes }, email,
    { ...details(formData, designerNotes, gateCode), keepNotes: !ownNotes && designerNotes === null },
  );
  if (saved === "missing") return MISSING;
  await mirrorToJob(jobId);
  after(() => syncJobCalendar(jobId, [kind]));
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
  if (confirmed.kind === "consultation" && (job?.status === "new" || job?.status === "contacted")) await setStage(jobId, "visit_booked", email);
  // Spec §5: a confirmed measure appointment on a Sold job is the Official measure. Ordered stays manual.
  if (confirmed.kind === "measure" && job?.status === "sold") {
    await setStage(jobId, "measure", email, { body: "Measure appointment confirmed" });
  }
  after(() => syncJobCalendar(jobId, [confirmed.kind]));

  let error: string | undefined;
  // The confirmation stands either way; these only explain why no email went out. Each one is also
  // logged against the job: a customer who was not told must be visible in Activity, whether or not
  // anyone reads the message on the card.
  if (!job) error = MISSING.error;
  else if (!job.email) {
    error = "This job has no email address.";
    await logAppointmentProblem(jobId, "Appointment confirmed but no email address on file", email);
  } else {
    try {
      await sendAppointmentConfirmation(job, confirmed);
      await logAppointmentEmail(jobId, job.email, email);
    } catch (sendError) {
      console.error("Appointment confirmation email failed", sendError);
      error = "Confirmed, but the email could not be sent.";
      const reason = sendError instanceof Error ? sendError.message : String(sendError);
      await logAppointmentProblem(jobId, `Appointment email not sent to ${job.email} — ${reason}`, email);
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

/**
 * "Edit notes": the appointment's designer notes, and the client's gate code when the form carries
 * it, without rescheduling. The appointment keeps its time and its confirmation. The sync pushes no
 * kind, so a date someone moved in Outlook is never overridden; it rewrites the body of each confirmed
 * event whose text changed, which also carries a new gate code to the job's other events.
 */
export async function updateAppointmentNotes(
  appointmentId: string, jobId: string, _prev: FormState, formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["designerNotes", "gateCode"]);
  const parsed = appointmentNotesSchema.safeParse({
    designerNotes: formData.get("designerNotes") ?? "",
    gateCode: formData.get("gateCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const saved = await setAppointmentNotes(
    jobId, appointmentId, details(formData, parsed.data.designerNotes, parsed.data.gateCode), email,
  );
  if (saved === "missing") return GONE;
  after(() => syncJobCalendar(jobId));
  refresh(jobId);
  return { ok: true };
}

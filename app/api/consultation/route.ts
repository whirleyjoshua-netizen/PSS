import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { hashToken, newToken } from "@/lib/admin/tokens";
import { consultationSchema } from "@/lib/leads/schema";
import { insertLead } from "@/lib/leads/db";
import { sendCustomerConfirmation, sendLeadNotification } from "@/lib/leads/email";
import { questionnaireCookie } from "@/lib/leads/questionnaire-cookie";
import { findReferrer } from "@/lib/referrals/db";
import { REF_COOKIE, cookieValue } from "@/lib/referrals/codes";
import { geocodeLead } from "@/lib/routes/geocode";
import { addNote, getJob } from "@/lib/admin/jobs";
import { logAppointmentEmail, logAppointmentProblem } from "@/lib/admin/appointments";
import { formatWhen } from "@/lib/admin/time";
import { sendAppointmentConfirmation } from "@/lib/appointments/send";
import { bookConsultation, type BookResult } from "@/lib/booking/book";
import { syncJobCalendar } from "@/lib/calendar/sync";

/**
 * The only dynamic endpoint on the site.
 *
 * Design rule: never lose a lead. The id is created first, before either
 * write, so the database write and the notification email — which links to
 * that id in the tracker — can run concurrently and be settled independently.
 * A failure in one does not prevent the other. The visitor sees an error only
 * if both fail — and then the form shows them the phone number instead.
 */
export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "We could not read that request." },
      { status: 400 },
    );
  }

  // Honeypot: accept and discard. An error response would tell a bot exactly
  // which field gave it away.
  if (
    typeof payload === "object" &&
    payload !== null &&
    "company" in payload &&
    (payload as { company?: unknown }).company
  ) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const parsed = consultationSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Please check your details and try again.",
      },
      { status: 400 },
    );
  }

  // A referral never blocks a lead: any lookup failure saves it unattributed.
  const lookup = (code: string) =>
    findReferrer(code).catch((error) => {
      console.error("Referral lookup failed", error);
      return null;
    });
  const cookieCode = cookieValue(request.headers.get("cookie"), REF_COOKIE);

  // An unresolved body code falls back to the cookie, rather than overriding
  // a valid one with nothing.
  const referrer =
    (parsed.data.referralCode ? await lookup(parsed.data.referralCode) : null) ??
    (cookieCode ? await lookup(cookieCode) : null);
  const id = randomUUID();
  const key = newToken();
  const lead = {
    ...parsed.data,
    heardVia: parsed.data.heardVia ?? (referrer ? "Referral from a friend" : undefined),
    referredBy: referrer?.id ?? null,
    id,
    questionnaireTokenHash: hashToken(key),
  };

  // A time picked in the home form's pop-up is booked once the lead is stored, and the owner's email
  // says how that went. Without one, the database write and the email run side by side.
  const slot = parsed.data.slot ? new Date(parsed.data.slot) : null;
  let booking: BookResult | null = null;
  let stored: PromiseSettledResult<{ id: string }>;
  let emailed: PromiseSettledResult<void>;
  if (!slot) {
    [stored, emailed] = await Promise.allSettled([insertLead(lead), sendLeadNotification(lead, id)]);
  } else {
    [stored] = await Promise.allSettled([insertLead(lead)]);
    if (stored.status === "fulfilled") {
      try {
        booking = await bookConsultation(id, slot);
      } catch (error) {
        console.error("Online booking failed", error);
      }
    }
    const booked = booking?.status === "booked";
    const line = booked
      ? `Booked online for ${formatWhen(slot)}. It is on the Outlook calendar.`
      : `Picked ${formatWhen(slot)} online, but it could not be booked. Call to schedule.`;
    [emailed] = await Promise.allSettled([sendLeadNotification({ ...lead, booking: { booked, line } }, id)]);
    if (stored.status === "fulfilled" && !booked) {
      await addNote(id, line, "customer").catch((error) => console.error("Missed-booking note failed", error));
    }
  }

  if (stored.status === "rejected") {
    console.error("Lead database write failed", stored.reason);
  }
  if (emailed.status === "rejected") {
    console.error("Lead notification email failed", emailed.reason);
  }
  // Coordinates for the route planner. Never blocks or fails the visitor's request.
  if (stored.status === "fulfilled") after(() => geocodeLead(stored.value.id));

  if (stored.status === "rejected" && emailed.status === "rejected") {
    return Response.json(
      {
        ok: false,
        error: "We could not submit your request. Please call us and we will get you scheduled.",
      },
      { status: 502 },
    );
  }

  // Only once the lead is known to be captured, so nobody is thanked for a
  // request that was lost. Its failure is logged, never shown to the visitor.
  // A booked visit gets the same confirmation the owner's Confirm sends, instead of "we will call".
  if (booking?.status === "booked") {
    const appointment = booking.appointment;
    after(() => syncJobCalendar(id, ["consultation"]));
    try {
      const job = await getJob(id);
      if (!job) throw new Error("The new job could not be read back");
      await sendAppointmentConfirmation(job, appointment);
      await logAppointmentEmail(id, parsed.data.email, "website");
    } catch (error) {
      console.error("Online booking confirmation email failed", error);
      const reason = error instanceof Error ? error.message : String(error);
      await logAppointmentProblem(id, `Booked online, but the confirmation email was not sent to ${parsed.data.email} — ${reason}`, "website")
        .catch((logError) => console.error("Booking email problem could not be logged", logError));
    }
  } else {
    try {
      await sendCustomerConfirmation(parsed.data);
    } catch (error) {
      console.error("Customer confirmation email failed", error);
    }
  }

  // The questionnaire key goes only to a visitor whose lead was actually stored.
  const headers = stored.status === "fulfilled" ? { "set-cookie": questionnaireCookie(key) } : undefined;
  return Response.json({ ok: true, booked: booking?.status === "booked" }, { status: 201, headers });
}

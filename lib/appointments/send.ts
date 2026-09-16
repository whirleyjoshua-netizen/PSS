import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import type { Appointment } from "@/lib/admin/appointments";
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";

/** Las Vegas shares Pacific time, including daylight saving. */
const ZONE = "America/Los_Angeles";

const partsOf = (date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, ...options })
      .formatToParts(date).map((part) => [part.type, part.value]),
  );

/** "Tuesday, October 14" in Las Vegas time, for the body. */
function longDay(date: Date): string {
  const p = partsOf(date, { weekday: "long", month: "long", day: "numeric" });
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/** "Tue, Oct 14" in Las Vegas time, for the subject line. */
function shortDay(date: Date): string {
  const p = partsOf(date, { weekday: "short", month: "short", day: "numeric" });
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/** "2:00 PM" in Las Vegas time. */
function timeOfDay(date: Date): string {
  const p = partsOf(date, { hour: "numeric", minute: "2-digit" });
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/**
 * How the customer hears about each kind. Deliberately not kindLabel(): "Measure" is our internal
 * column heading, "measurement visit" is what a person books.
 */
const KIND_WORDS: Record<AppointmentKind, string> = {
  consultation: "consultation",
  measure: "measurement visit",
  install: "installation",
  service: "service visit",
};

/** One line saying what actually happens, so the email answers "what is this?" on its own. */
const KIND_LINES: Record<AppointmentKind, string> = {
  consultation: "We'll go over your windows and options, and answer any questions you have.",
  measure: "We'll take exact measurements so your treatments fit perfectly.",
  install: "We'll install your window treatments and make sure everything works the way it should.",
  service: "We'll take care of the issue and make sure everything works the way it should.",
};

export type AppointmentEmailInput = {
  firstName: string;
  kind: AppointmentKind;
  startsAt: Date;
  allDay: boolean;
  address: string;
};

/** Plain text, like the other customer emails, so it reads the same on every phone. */
export function appointmentEmailText(input: AppointmentEmailInput): string {
  // An all-day appointment has no meaningful time, so the customer is only told the day.
  const when = input.allDay
    ? longDay(input.startsAt)
    : `${longDay(input.startsAt)} at ${timeOfDay(input.startsAt)}`;
  return [
    `Hi ${input.firstName},`,
    "",
    `Your ${KIND_WORDS[input.kind]} is booked for ${when}.`,
    "",
    `We'll come to ${input.address}.`,
    "",
    KIND_LINES[input.kind],
    "",
    `Need to change it? Reply to this email or call ${business.phone.display}.`,
    "",
    business.name,
    business.domain,
  ].join("\n");
}

/** The customer's subject line: what is booked, and the day it is booked for. */
export const appointmentEmailSubject = (kind: AppointmentKind, startsAt: Date): string =>
  `Your ${KIND_WORDS[kind]} is booked for ${shortDay(startsAt)}`;

/**
 * Tells the customer their appointment is set. Only the confirm path calls this — an unconfirmed
 * appointment is not a promise yet. Throws on missing config, a missing email, or a rejected send.
 */
export async function sendAppointmentConfirmation(job: Job, appointment: Appointment): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!job.email) throw new Error("This job has no email address");

  const firstName = job.name.trim().split(/\s+/)[0];
  const address = job.address ? `${job.address}, ${job.city}` : job.city;
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: job.email,
    replyTo: business.email,
    subject: appointmentEmailSubject(appointment.kind, appointment.startsAt),
    text: appointmentEmailText({
      firstName, kind: appointment.kind, startsAt: appointment.startsAt,
      allDay: appointment.allDay, address,
    }),
  });
  if (error) throw new Error(`Resend rejected the appointment confirmation: ${error.message}`);
}

import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import type { Appointment } from "@/lib/admin/appointments";
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";
import { clientWindowLabel } from "@/lib/routes/window";
import { roleLabel, type TeamRole } from "@/lib/admin/team-roles";

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

/** What the assigned person does at each kind of visit, after their first name. */
const KIND_LINES: Record<AppointmentKind, string> = {
  consultation: "will take a look at your windows, walk you through the available options, and help you find the right solution for your home.",
  measure: "will take exact measurements so your treatments fit perfectly.",
  install: "will install your window treatments and make sure everything works the way it should.",
  service: "will take care of the issue and make sure everything works the way it should.",
};

/** The footer shows the site as people type it, without the scheme. */
const bareDomain = business.domain.replace(/^https?:\/\//, "");

/** The person the customer will meet: the job's assignee. */
export type AppointmentAssignee = { name: string; role: TeamRole };

export type AppointmentEmailInput = {
  firstName: string;
  kind: AppointmentKind;
  startsAt: Date;
  allDay: boolean;
  address: string;
  /** The arrival window as "HH:MM", or null when none was set. */
  windowStart: string | null;
  windowEnd: string | null;
  /** Null when nobody is assigned: the email then names no one. */
  assignee: AppointmentAssignee | null;
};

/** Plain text, like the other customer emails, so it reads the same on every phone. */
export function appointmentEmailText(input: AppointmentEmailInput): string {
  // An all-day appointment has no meaningful time, so the customer is only told the day.
  const when = input.allDay
    ? longDay(input.startsAt)
    : `${longDay(input.startsAt)} at ${timeOfDay(input.startsAt)}`;
  const arrival = clientWindowLabel(input.windowStart, input.windowEnd);
  const person = input.assignee;
  const role = person ? roleLabel(person.role) : null;
  const personFirst = person ? person.name.trim().split(/\s+/)[0] : null;
  return [
    `Hi ${input.firstName},`,
    "",
    `Your ${KIND_WORDS[input.kind]} is confirmed for ${when}.`,
    "",
    ...(person ? [`Your ${role}: ${person.name}`] : []),
    ...(arrival ? [`Arrival window: ${arrival}`] : []),
    `Location: ${input.address}`,
    "",
    ...(person
      ? [
          `You’ll be meeting with ${person.name}, your ${business.name} ${role}. ${personFirst} ${KIND_LINES[input.kind]}`,
          "",
        ]
      : []),
    `Have a question before your appointment or need to make a change? Call or text us at ${business.phone.display}, or simply reply to this email.`,
    "",
    "We look forward to meeting you!",
    "",
    business.name,
    bareDomain,
  ].join("\n");
}

/** The customer's subject line: what is confirmed, and the day it is for. */
export const appointmentEmailSubject = (kind: AppointmentKind, startsAt: Date): string =>
  `Your ${KIND_WORDS[kind]} is confirmed for ${shortDay(startsAt)}`;

/**
 * Tells the customer their appointment is set. Only the confirm path calls this — an unconfirmed
 * appointment is not a promise yet. Throws on missing config, a missing email, or a rejected send.
 */
export async function sendAppointmentConfirmation(job: Job, appointment: Appointment): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!job.email) throw new Error("This job has no email address");

  // A job saved without a name would otherwise greet the customer with "Hi ,".
  const firstName = job.name.trim().split(/\s+/)[0] || "there";
  const address = job.address ? `${job.address}, ${job.city}` : job.city;
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: job.email,
    replyTo: business.email,
    subject: appointmentEmailSubject(appointment.kind, appointment.startsAt),
    text: appointmentEmailText({
      firstName, kind: appointment.kind, startsAt: appointment.startsAt,
      allDay: appointment.allDay, address,
      windowStart: appointment.windowStart, windowEnd: appointment.windowEnd,
      // The job's assignee is who the customer meets; a name with no known role names no one.
      assignee: job.assignedName?.trim() && job.assignedRole
        ? { name: job.assignedName.trim(), role: job.assignedRole }
        : null,
    }),
  });
  if (error) throw new Error(`Resend rejected the appointment confirmation: ${error.message}`);
}

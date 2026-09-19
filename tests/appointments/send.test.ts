import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";
import type { Appointment } from "@/lib/admin/appointments";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { appointmentEmailText, sendAppointmentConfirmation } = await import("@/lib/appointments/send");
const { business } = await import("@/content/business");

/** 2:00 PM in Las Vegas on Tuesday, October 13 2026. */
const AT = new Date("2026-10-13T21:00:00Z");

const job = (overrides: Partial<Job> = {}): Job => ({
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Dana Reyes",
  phone: "7025550134", email: "dana@example.com", address: "88 Palm Ct", city: "Henderson", treatments: [],
  windowCount: null, heardVia: null, notes: null, source: "contact", status: "visit_booked",
  stageChangedAt: new Date(), visitAt: null, quoteCents: null, soldCents: null,
  depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
  ...overrides,
});

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "a1", jobId: job().id, kind: "consultation", startsAt: AT, allDay: false,
  confirmedAt: new Date(), confirmedBy: "owner@example.com", windowStart: null, windowEnd: null, durationMinutes: null,
  ...overrides,
});

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("LEAD_FROM_EMAIL", "leads@premiershadesolutions.com");
});

describe("appointmentEmailText", () => {
  type Input = Parameters<typeof appointmentEmailText>[0];
  const SHADE = { name: "Shade Momodu", role: "designer" as const };
  const text = (over: Partial<Input> = {}) =>
    appointmentEmailText({
      firstName: "Maria", kind: "consultation", startsAt: AT, allDay: false,
      address: "1234 Desert Rose Dr, Henderson", windowStart: null, windowEnd: null, assignee: null, ...over,
    });

  it("reproduces the owner's consultation template exactly", () => {
    expect(text({ assignee: SHADE, windowStart: "14:00", windowEnd: "16:00" }).split("\n")).toEqual([
      "Hi Maria,",
      "",
      "Your consultation is confirmed for Tuesday, October 13 at 2:00 PM.",
      "",
      "Your Designer: Shade Momodu",
      "Arrival window: 2:00–4:00 PM",
      "Location: 1234 Desert Rose Dr, Henderson",
      "",
      "You’ll be meeting with Shade Momodu, your Premier Shade Solutions Designer. Shade will take a look at your windows, walk you through the available options, and help you find the right solution for your home.",
      "",
      `Have a question before your appointment or need to make a change? Call or text us at ${business.phone.display}, or simply reply to this email.`,
      "",
      "We look forward to meeting you!",
      "",
      business.name,
      "premiershadesolutions.com",
    ]);
  });

  it("says what each kind of visit does, by the assignee's first name", () => {
    const tail = (kind: Input["kind"]) => text({ kind, assignee: SHADE });
    expect(tail("measure")).toContain("Shade will take exact measurements so your treatments fit perfectly.");
    expect(tail("install")).toContain("Shade will install your window treatments and make sure everything works the way it should.");
    expect(tail("service")).toContain("Shade will take care of the issue and make sure everything works the way it should.");
    expect(tail("measure")).toContain("Your measurement visit is confirmed for");
    expect(tail("install")).toContain("Your installation is confirmed for");
    expect(tail("service")).toContain("Your service visit is confirmed for");
    expect(tail("measure")).not.toContain("Measure ");
  });

  it("labels an installer as the installer", () => {
    const body = text({ kind: "install", assignee: { name: "Luis Ortega", role: "installer" } });
    expect(body).toContain("Your Installer: Luis Ortega");
    expect(body).toContain("You’ll be meeting with Luis Ortega, your Premier Shade Solutions Installer. Luis will install");
    expect(body).not.toContain("Designer");
  });

  it("drops the person line and the meeting paragraph when nobody is assigned", () => {
    expect(text({ kind: "measure" }).split("\n")).toEqual([
      "Hi Maria,",
      "",
      "Your measurement visit is confirmed for Tuesday, October 13 at 2:00 PM.",
      "",
      "Location: 1234 Desert Rose Dr, Henderson",
      "",
      `Have a question before your appointment or need to make a change? Call or text us at ${business.phone.display}, or simply reply to this email.`,
      "",
      "We look forward to meeting you!",
      "",
      business.name,
      "premiershadesolutions.com",
    ]);
  });

  it("writes a window that crosses noon with both periods, and none without a window", () => {
    expect(text({ windowStart: "11:00", windowEnd: "13:00" })).toContain("Arrival window: 11:00 AM–1:00 PM");
    expect(text()).not.toContain("Arrival window");
    expect(text({ windowStart: "11:00", windowEnd: "13:00" })).not.toContain("We'll arrive");
  });

  it("shows only the day for an all-day appointment", () => {
    const body = text({ kind: "install", allDay: true });
    expect(body).toContain("Your installation is confirmed for Tuesday, October 13.\n");
    expect(body).not.toContain("2:00 PM");
  });

  it("never leaks internal wording, the job id, or the https scheme", () => {
    const body = text({ assignee: SHADE });
    expect(body).not.toMatch(/pending/i);
    expect(body).not.toContain(job().id);
    expect(body).not.toContain("https://");
  });
});

describe("sendAppointmentConfirmation", () => {
  it("emails the customer from the business with the booked-for subject", async () => {
    await sendAppointmentConfirmation(job(), appointment());
    const message = send.mock.calls[0][0];
    expect(message.from).toBe(`${business.name} <leads@premiershadesolutions.com>`);
    expect(message.to).toBe("dana@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.subject).toBe("Your consultation is confirmed for Tue, Oct 13");
    expect(message.text).toContain("Tuesday, October 13 at 2:00 PM");
    expect(message.text).toContain("88 Palm Ct, Henderson");
  });

  it("passes the appointment's arrival window into the email", async () => {
    await sendAppointmentConfirmation(job(), appointment({ windowStart: "13:00", windowEnd: "15:00" }));
    expect(send.mock.calls[0][0].text).toContain("Arrival window: 1:00–3:00 PM");
  });

  it("names the kind in the subject in customer words", async () => {
    await sendAppointmentConfirmation(job(), appointment({ kind: "install", allDay: true }));
    expect(send.mock.calls[0][0].subject).toBe("Your installation is confirmed for Tue, Oct 13");
  });

  it("names the job's assignee, and no one when the job is unassigned", async () => {
    await sendAppointmentConfirmation(job({ assignedName: "Shade Momodu", assignedRole: "designer" }), appointment());
    expect(send.mock.calls[0][0].text).toContain("Your Designer: Shade Momodu");
    expect(send.mock.calls[0][0].text).toContain("Shade will take a look at your windows");
    await sendAppointmentConfirmation(job({ assignedName: null, assignedRole: null }), appointment());
    expect(send.mock.calls[1][0].text).not.toContain("meeting with");
    expect(send.mock.calls[1][0].text).not.toContain("Your Designer");
  });

  it("greets a nameless job without an empty 'Hi ,'", async () => {
    await sendAppointmentConfirmation(job({ name: "   " }), appointment());
    expect(send.mock.calls[0][0].text).toMatch(/^Hi there,/);
  });

  it("falls back to the city when the job has no street address", async () => {
    await sendAppointmentConfirmation(job({ address: null }), appointment());
    expect(send.mock.calls[0][0].text).toContain("Location: Henderson\n");
  });

  it("refuses to send without an email address", async () => {
    await expect(sendAppointmentConfirmation(job({ email: null }), appointment()))
      .rejects.toThrow("This job has no email address");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses to send without the Resend key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendAppointmentConfirmation(job(), appointment())).rejects.toThrow(/RESEND_API_KEY/);
    expect(send).not.toHaveBeenCalled();
  });

  it("throws when Resend rejects the message", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendAppointmentConfirmation(job(), appointment())).rejects.toThrow(/domain not verified/);
  });
});

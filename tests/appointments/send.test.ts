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
  const text = (over: Partial<Input> = {}) =>
    appointmentEmailText({
      firstName: "Dana", kind: "consultation", startsAt: AT, allDay: false,
      address: "88 Palm Ct, Henderson", windowStart: null, windowEnd: null, ...over,
    });

  it("greets by first name and gives the Las Vegas day and time", () => {
    const body = text();
    expect(body).toMatch(/^Hi Dana,/);
    expect(body).toContain("Tuesday, October 13 at 2:00 PM");
  });

  it("names each kind in customer words, never the internal label", () => {
    expect(text({ kind: "consultation" })).toContain("consultation");
    expect(text({ kind: "measure" })).toContain("measurement visit");
    expect(text({ kind: "install" })).toContain("installation");
    expect(text({ kind: "service" })).toContain("service visit");
    expect(text({ kind: "measure" })).not.toContain("Measure");
  });

  it("shows only the day for an all-day installation", () => {
    const body = text({ kind: "install", allDay: true });
    expect(body).toContain("Tuesday, October 13");
    expect(body).not.toContain("2:00 PM");
    expect(body).not.toMatch(/October 13 at /);
  });

  it("carries the address we are coming to, the phone, and the sign-off", () => {
    const body = text();
    expect(body).toContain("88 Palm Ct, Henderson");
    expect(body).toContain(business.phone.display);
    expect(body).toContain(business.name);
  });

  it("says when we'll arrive when a window is set", () => {
    const body = text({ allDay: true, windowStart: "08:00", windowEnd: "10:00" });
    expect(body).toContain("We'll arrive between 8:00 and 10:00 am.");
    expect(body.indexOf("We'll arrive")).toBeGreaterThan(body.indexOf("is booked for"));
    expect(body.indexOf("We'll arrive")).toBeLessThan(body.indexOf("We'll come to"));
  });

  it("reads naturally for a window ending at noon or running into the afternoon", () => {
    expect(text({ windowStart: "10:00", windowEnd: "12:00" })).toContain("We'll arrive between 10:00 am and 12:00 pm.");
    expect(text({ windowStart: "11:30", windowEnd: "13:30" })).toContain("We'll arrive between 11:30 am and 1:30 pm.");
    expect(text({ windowStart: "12:00", windowEnd: "14:00" })).toContain("We'll arrive between 12:00 and 2:00 pm.");
  });

  it("adds nothing new without a window", () => {
    expect(text({ windowStart: null, windowEnd: null })).not.toContain("arrive");
  });

  it("never leaks internal wording or the job id", () => {
    const body = text();
    expect(body).not.toMatch(/pending/i);
    expect(body).not.toContain(job().id);
  });
});

describe("sendAppointmentConfirmation", () => {
  it("emails the customer from the business with the booked-for subject", async () => {
    await sendAppointmentConfirmation(job(), appointment());
    const message = send.mock.calls[0][0];
    expect(message.from).toBe(`${business.name} <leads@premiershadesolutions.com>`);
    expect(message.to).toBe("dana@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.subject).toBe("Your consultation is booked for Tue, Oct 13");
    expect(message.text).toContain("Tuesday, October 13 at 2:00 PM");
    expect(message.text).toContain("88 Palm Ct, Henderson");
  });

  it("passes the appointment's arrival window into the email", async () => {
    await sendAppointmentConfirmation(job(), appointment({ windowStart: "13:00", windowEnd: "15:00" }));
    expect(send.mock.calls[0][0].text).toContain("We'll arrive between 1:00 and 3:00 pm.");
  });

  it("names the kind in the subject in customer words", async () => {
    await sendAppointmentConfirmation(job(), appointment({ kind: "install", allDay: true }));
    expect(send.mock.calls[0][0].subject).toBe("Your installation is booked for Tue, Oct 13");
  });

  it("greets a nameless job without an empty 'Hi ,'", async () => {
    await sendAppointmentConfirmation(job({ name: "   " }), appointment());
    expect(send.mock.calls[0][0].text).toMatch(/^Hi there,/);
  });

  it("falls back to the city when the job has no street address", async () => {
    await sendAppointmentConfirmation(job({ address: null }), appointment());
    expect(send.mock.calls[0][0].text).toContain("Henderson");
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

import { describe, it, expect, vi, beforeEach } from "vitest";

const insertLead = vi.fn();
const sendLeadNotification = vi.fn();
const sendCustomerConfirmation = vi.fn();
vi.mock("@/lib/leads/db", () => ({ insertLead }));
vi.mock("@/lib/leads/email", () => ({ sendLeadNotification, sendCustomerConfirmation }));
vi.mock("@/lib/routes/geocode", () => ({ geocodeLead: vi.fn().mockResolvedValue(undefined) }));
const bookConsultation = vi.fn();
vi.mock("@/lib/booking/book", () => ({ bookConsultation }));
const addNote = vi.fn();
const getJob = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ addNote, getJob }));
const logAppointmentEmail = vi.fn();
const logAppointmentProblem = vi.fn();
vi.mock("@/lib/admin/appointments", () => ({ logAppointmentEmail, logAppointmentProblem }));
const sendAppointmentConfirmation = vi.fn();
vi.mock("@/lib/appointments/send", () => ({ sendAppointmentConfirmation }));
const syncJobCalendar = vi.fn();
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { (cb() as Promise<unknown> | undefined)?.catch?.(() => {}); } }));

const { POST } = await import("@/app/api/consultation/route");

const SLOT = "2026-10-22T17:00:00.000Z"; // Thu Oct 22, 10 AM in Las Vegas
const body = {
  name: "Dana Reyes", phone: "7025550134", email: "dana@example.com", city: "Henderson", source: "hero",
  address: "12 Sample St", slot: SLOT,
};
const request = (payload: unknown) =>
  new Request("http://localhost/api/consultation", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
const appointment = { id: "appt-1", kind: "consultation", startsAt: new Date(SLOT) };
const job = { id: "abc", name: "Dana Reyes", email: "dana@example.com" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  insertLead.mockReset().mockResolvedValue({ id: "abc" });
  sendLeadNotification.mockReset().mockResolvedValue(undefined);
  sendCustomerConfirmation.mockReset().mockResolvedValue(undefined);
  bookConsultation.mockReset().mockResolvedValue({ status: "booked", appointment });
  addNote.mockReset().mockResolvedValue(true);
  getJob.mockReset().mockResolvedValue(job);
  logAppointmentEmail.mockReset().mockResolvedValue(undefined);
  logAppointmentProblem.mockReset().mockResolvedValue(undefined);
  sendAppointmentConfirmation.mockReset().mockResolvedValue(undefined);
  syncJobCalendar.mockReset().mockResolvedValue(undefined);
});

describe("a time picked in the home form", () => {
  it("is booked once the lead is stored, on the calendar, and confirmed to the customer", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, booked: true });
    const id = insertLead.mock.calls[0][0].id;
    expect(bookConsultation).toHaveBeenCalledWith(id, new Date(SLOT));
    expect(insertLead.mock.invocationCallOrder[0]).toBeLessThan(bookConsultation.mock.invocationCallOrder[0]);
    expect(syncJobCalendar).toHaveBeenCalledWith(id, ["consultation"]);
    expect(sendAppointmentConfirmation).toHaveBeenCalledWith(job, appointment);
    expect(logAppointmentEmail).toHaveBeenCalledWith(id, "dana@example.com", "website");
    // Never the "we will call you" email for a visit that is already booked.
    expect(sendCustomerConfirmation).not.toHaveBeenCalled();
    expect(addNote).not.toHaveBeenCalled();
  });

  it("tells the owner it was booked", async () => {
    await POST(request(body));
    expect(bookConsultation.mock.invocationCallOrder[0]).toBeLessThan(sendLeadNotification.mock.invocationCallOrder[0]);
    expect(sendLeadNotification.mock.calls[0][0].booking).toEqual({
      booked: true, line: "Booked online for Thu, Oct 22, 10:00 AM. It is on the Outlook calendar.",
    });
  });

  it("falls back to a call when the time was taken, and says so to the owner and on the job", async () => {
    bookConsultation.mockResolvedValue({ status: "taken" });
    const response = await POST(request(body));
    expect(await response.json()).toEqual({ ok: true, booked: false });
    const line = "Picked Thu, Oct 22, 10:00 AM online, but it could not be booked. Call to schedule.";
    expect(sendLeadNotification.mock.calls[0][0].booking).toEqual({ booked: false, line });
    expect(addNote).toHaveBeenCalledWith(insertLead.mock.calls[0][0].id, line, "customer");
    expect(sendCustomerConfirmation).toHaveBeenCalledOnce();
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });

  it("still keeps the lead when booking throws", async () => {
    bookConsultation.mockRejectedValue(new Error("Graph GET failed (503)"));
    const response = await POST(request(body));
    expect(await response.json()).toEqual({ ok: true, booked: false });
    expect(sendLeadNotification).toHaveBeenCalledOnce();
    expect(sendCustomerConfirmation).toHaveBeenCalledOnce();
  });

  it("is never booked when the lead was not stored, but the owner still hears about it", async () => {
    insertLead.mockRejectedValue(new Error("db down"));
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(bookConsultation).not.toHaveBeenCalled();
    expect(sendLeadNotification.mock.calls[0][0].booking.booked).toBe(false);
    expect(addNote).not.toHaveBeenCalled();
  });

  it("logs a booking whose confirmation email failed, without failing the visitor", async () => {
    sendAppointmentConfirmation.mockRejectedValue(new Error("Resend down"));
    const response = await POST(request(body));
    expect(await response.json()).toEqual({ ok: true, booked: true });
    expect(logAppointmentProblem).toHaveBeenCalledWith(expect.any(String),
      "Booked online, but the confirmation email was not sent to dana@example.com — Resend down", "website");
  });

  it("needs a street address", async () => {
    const response = await POST(request({ ...body, address: undefined }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Please enter the street address for your visit.");
    expect(insertLead).not.toHaveBeenCalled();
  });

  it("drops a malformed time and takes the lead the ordinary way", async () => {
    const response = await POST(request({ ...body, slot: "tomorrow at ten" }));
    expect(await response.json()).toEqual({ ok: true, booked: false });
    expect(bookConsultation).not.toHaveBeenCalled();
    expect(sendLeadNotification.mock.calls[0][0].booking).toBeUndefined();
  });
});

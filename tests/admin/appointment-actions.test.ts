import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const appointments = {
  listAppointments: vi.fn(), saveAppointment: vi.fn(), confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(), mirrorToJob: vi.fn(), logConfirmation: vi.fn(), logAppointmentEmail: vi.fn(),
};
vi.mock("@/lib/admin/appointments", () => appointments);
const jobs = { getJob: vi.fn(), setStage: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const sendAppointmentConfirmation = vi.fn();
vi.mock("@/lib/appointments/send", () => ({ sendAppointmentConfirmation }));
const syncJobCalendar = vi.fn();
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { cb(); } }));

const actions = await import("@/app/admin/jobs/appointment-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const APPT = "9c8b7a65-4d3e-4f21-8a0b-1c2d3e4f5a6b";
/** 10:00 AM in Las Vegas on Sunday, September 20 2026. */
const STARTS = new Date("2026-09-20T17:00:00Z");

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};
const booking = (over: Record<string, string> = {}) =>
  form({ kind: "consultation", startsAt: "2026-09-20T10:00", ...over });
const confirmed = (over: Record<string, unknown> = {}) => ({
  id: APPT, jobId: JOB, kind: "consultation", startsAt: STARTS, allDay: false,
  confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com", ...over,
});
const job = (over: Record<string, unknown> = {}) => ({
  id: JOB, name: "Dana Reyes", email: "dana@example.com", status: "new", ...over,
});

beforeEach(() => {
  Object.values(appointments).forEach((fn) => fn.mockReset());
  Object.values(jobs).forEach((fn) => fn.mockReset());
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  appointments.saveAppointment.mockResolvedValue("ok");
  appointments.confirmAppointment.mockResolvedValue(confirmed());
  appointments.cancelAppointment.mockResolvedValue(confirmed());
  appointments.mirrorToJob.mockResolvedValue(undefined);
  jobs.getJob.mockResolvedValue(job());
  jobs.setStage.mockResolvedValue(true);
  sendAppointmentConfirmation.mockReset().mockResolvedValue(undefined);
  syncJobCalendar.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("without a session", () => {
  beforeEach(() => { requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT")); });

  it.each([
    ["bookAppointment", () => actions.bookAppointment(JOB, {}, booking())],
    ["confirmSchedule", () => actions.confirmSchedule(APPT, JOB)],
    ["cancelAppointmentAction", () => actions.cancelAppointmentAction(APPT, JOB)],
  ])("%s touches nothing", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    [...Object.values(appointments), ...Object.values(jobs), sendAppointmentConfirmation, syncJobCalendar]
      .forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});

describe("bookAppointment", () => {
  it("saves the parsed appointment as the signed-in owner", async () => {
    expect(await actions.bookAppointment(JOB, {}, booking())).toEqual({ ok: true });
    expect(appointments.saveAppointment).toHaveBeenCalledWith(
      JOB, "consultation", STARTS, false, "owner@example.com",
    );
  });

  it("carries an all-day booking through", async () => {
    await actions.bookAppointment(JOB, {}, booking({ kind: "install", allDay: "on" }));
    expect(appointments.saveAppointment).toHaveBeenCalledWith(JOB, "install", STARTS, true, "owner@example.com");
  });

  it("mirrors, so a re-booked confirmation clears the job's date", async () => {
    await actions.bookAppointment(JOB, {}, booking());
    expect(appointments.mirrorToJob).toHaveBeenCalledWith(JOB);
  });

  it("neither emails nor syncs: a booking is pending until it is confirmed", async () => {
    await actions.bookAppointment(JOB, {}, booking());
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });

  it("explains a missing date and a missing kind, and saves nothing", async () => {
    const noDate = await actions.bookAppointment(JOB, {}, booking({ startsAt: "" }));
    expect(noDate.error).toBe("Pick a date and time");
    const noKind = await actions.bookAppointment(JOB, {}, booking({ kind: "" }));
    expect(noKind.error).toBe("Pick what this is for");
    expect(appointments.saveAppointment).not.toHaveBeenCalled();
  });

  it("echoes the submitted values back on a failure", async () => {
    const state = await actions.bookAppointment(JOB, {}, booking({ startsAt: "" }));
    // The empty field is echoed too, so the form redraws exactly as it was submitted.
    expect(state.values).toEqual({ kind: "consultation", startsAt: "" });
  });

  it("reports a job that no longer exists", async () => {
    appointments.saveAppointment.mockResolvedValue("missing");
    expect(await actions.bookAppointment(JOB, {}, booking())).toEqual({ error: "That job no longer exists." });
  });
});

describe("confirmSchedule", () => {
  it("confirms, mirrors, syncs that kind and emails once", async () => {
    expect(await actions.confirmSchedule(APPT, JOB)).toEqual({ ok: true });
    expect(appointments.confirmAppointment).toHaveBeenCalledWith(APPT, "owner@example.com");
    expect(appointments.mirrorToJob).toHaveBeenCalledWith(JOB);
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, ["consultation"]);
    expect(sendAppointmentConfirmation).toHaveBeenCalledTimes(1);
    expect(sendAppointmentConfirmation).toHaveBeenCalledWith(job(), confirmed());
  });

  it("mirrors before the Outlook sync reads the job", async () => {
    const order: string[] = [];
    appointments.mirrorToJob.mockImplementation(async () => { order.push("mirror"); });
    syncJobCalendar.mockImplementation(async () => { order.push("sync"); });
    await actions.confirmSchedule(APPT, JOB);
    expect(order).toEqual(["mirror", "sync"]);
  });

  it("logs the confirmation and the email", async () => {
    await actions.confirmSchedule(APPT, JOB);
    expect(appointments.logConfirmation).toHaveBeenCalledWith(confirmed(), "owner@example.com");
    expect(appointments.logAppointmentEmail).toHaveBeenCalledWith(JOB, "dana@example.com", "owner@example.com");
  });

  it("moves a new job to visit_booked when the consultation is confirmed", async () => {
    await actions.confirmSchedule(APPT, JOB);
    expect(jobs.setStage).toHaveBeenCalledWith(JOB, "visit_booked", "owner@example.com");
  });

  it("leaves a job that has moved on where it is", async () => {
    jobs.getJob.mockResolvedValue(job({ status: "quoted" }));
    await actions.confirmSchedule(APPT, JOB);
    expect(jobs.setStage).not.toHaveBeenCalled();
  });

  it.each(["measure", "install", "service"])("does not move the stage for a %s", async (kind) => {
    appointments.confirmAppointment.mockResolvedValue(confirmed({ kind }));
    await actions.confirmSchedule(APPT, JOB);
    expect(jobs.setStage).not.toHaveBeenCalled();
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, [kind]);
  });

  it("sends no second email for an appointment already confirmed", async () => {
    appointments.confirmAppointment.mockResolvedValue("already");
    expect(await actions.confirmSchedule(APPT, JOB)).toEqual({ ok: true });
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
    expect(appointments.logAppointmentEmail).not.toHaveBeenCalled();
  });

  it("reports an appointment that no longer exists", async () => {
    appointments.confirmAppointment.mockResolvedValue("missing");
    expect((await actions.confirmSchedule(APPT, JOB)).error).toMatch(/no longer exists/i);
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
  });

  it("still confirms and syncs a job with no email address", async () => {
    jobs.getJob.mockResolvedValue(job({ email: null }));
    expect(await actions.confirmSchedule(APPT, JOB)).toEqual({ error: "This job has no email address." });
    expect(appointments.confirmAppointment).toHaveBeenCalled();
    expect(appointments.mirrorToJob).toHaveBeenCalledWith(JOB);
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, ["consultation"]);
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
  });

  it("says so plainly when the job itself is gone, rather than blaming a missing email", async () => {
    jobs.getJob.mockResolvedValue(null);
    expect(await actions.confirmSchedule(APPT, JOB)).toEqual({ error: "That job no longer exists." });
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
  });

  it("keeps the confirmation when the email is rejected", async () => {
    sendAppointmentConfirmation.mockRejectedValue(new Error("domain not verified"));
    expect(await actions.confirmSchedule(APPT, JOB)).toEqual({ error: "Confirmed, but the email could not be sent." });
    expect(appointments.confirmAppointment).toHaveBeenCalled();
    expect(appointments.mirrorToJob).toHaveBeenCalledWith(JOB);
    expect(appointments.logConfirmation).toHaveBeenCalled();
    expect(appointments.logAppointmentEmail).not.toHaveBeenCalled();
  });
});

describe("cancelAppointmentAction", () => {
  it("deletes, mirrors and syncs so the Outlook event goes", async () => {
    expect(await actions.cancelAppointmentAction(APPT, JOB)).toEqual({ ok: true });
    expect(appointments.cancelAppointment).toHaveBeenCalledWith(APPT, "owner@example.com");
    expect(appointments.mirrorToJob).toHaveBeenCalledWith(JOB);
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, ["consultation"]);
  });

  it("mirrors before the sync, so leads.visit_at is never left stale", async () => {
    const order: string[] = [];
    appointments.mirrorToJob.mockImplementation(async () => { order.push("mirror"); });
    syncJobCalendar.mockImplementation(async () => { order.push("sync"); });
    await actions.cancelAppointmentAction(APPT, JOB);
    expect(order).toEqual(["mirror", "sync"]);
  });

  it("never emails the customer about a cancellation", async () => {
    await actions.cancelAppointmentAction(APPT, JOB);
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
  });

  it("reports an appointment that is already gone", async () => {
    appointments.cancelAppointment.mockResolvedValue("missing");
    expect((await actions.cancelAppointmentAction(APPT, JOB)).error).toMatch(/no longer exists/i);
    expect(appointments.mirrorToJob).not.toHaveBeenCalled();
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });
});

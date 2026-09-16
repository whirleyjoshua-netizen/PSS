import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const logCall = vi.fn();
vi.mock("@/lib/admin/calls", () => ({ logCall }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect }));
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCallbacks.push(cb); } }));
const syncJobCalendar = vi.fn();
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar }));
const mirrorToJob = vi.fn();
vi.mock("@/lib/admin/appointments", () => ({ mirrorToJob }));
const getDay = vi.fn();
vi.mock("@/lib/calendar/week", () => ({ getDay: (...args: unknown[]) => getDay(...args) }));

const { logCallAction, callDaySchedule } = await import("@/app/admin/jobs/call-actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  logCall.mockReset().mockResolvedValue(true);
  redirect.mockClear();
  syncJobCalendar.mockReset();
  mirrorToJob.mockReset();
  getDay.mockReset();
  afterCallbacks.length = 0;
});
const runAfter = async () => { for (const cb of afterCallbacks.splice(0)) await cb(); };

describe("logCallAction", () => {
  it("checks the session before reading input", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(logCallAction(JOB, {}, form([["outcome", "talked"]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(logCall).not.toHaveBeenCalled();
  });

  it("saves the call as the owner and returns to the job", async () => {
    await expect(logCallAction(JOB, {}, form([
      ["outcome", "talked"], ["treatmentTypes", "shutters"], ["treatmentTypes", "roller_shades"], ["motorized", "on"],
      ["windowCountExact", "5"], ["gateCode", "#4321"], ["budget", "value"], ["notes", "Fri pm"],
    ]))).rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}`);
    expect(logCall).toHaveBeenCalledWith(JOB, {
      outcome: "talked", treatmentTypes: ["shutters", "roller_shades"], motorized: true, windowCountExact: 5, gateCode: "#4321",
      budgetTier: "value", notes: "Fri pm", visitAt: null, followUpAt: null, followUpNote: null,
    }, "owner@example.com");
  });

  it("keeps what was typed when validation fails", async () => {
    const state = await logCallAction(JOB, {}, form([["outcome", "booked"], ["treatmentTypes", "shutters"], ["notes", "x"]]));
    expect(state.error).toBe("Pick the visit date and time");
    expect(state.values).toMatchObject({ outcome: "booked", treatmentTypes: "shutters", notes: "x" });
    expect(logCall).not.toHaveBeenCalled();
  });

  it("reports a job that no longer exists", async () => {
    logCall.mockResolvedValue(false);
    expect(await logCallAction(JOB, {}, form([["outcome", "no_answer"]]))).toEqual({ error: "That job no longer exists." });
  });

  it("pushes the visit to Outlook after a booked call", async () => {
    await expect(logCallAction(JOB, {}, form([["outcome", "booked"], ["visitAt", "2026-09-20T10:00"]])))
      .rejects.toThrow("NEXT_REDIRECT");
    await runAfter();
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, ["consultation"]);
  });

  it("mirrors the confirmed consultation onto the job before the sync runs", async () => {
    await expect(logCallAction(JOB, {}, form([["outcome", "booked"], ["visitAt", "2026-09-20T10:00"]])))
      .rejects.toThrow("NEXT_REDIRECT");
    // The mirror is the only writer of leads.visit_at, and the Outlook push reads it.
    expect(mirrorToJob).toHaveBeenCalledWith(JOB);
    expect(syncJobCalendar).not.toHaveBeenCalled();
    await runAfter();
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, ["consultation"]);
  });

  it("syncs without pushing after any other outcome", async () => {
    await expect(logCallAction(JOB, {}, form([["outcome", "talked"]]))).rejects.toThrow("NEXT_REDIRECT");
    await runAfter();
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, []);
    expect(mirrorToJob).not.toHaveBeenCalled();
  });

  it("does not mirror when the call did not save", async () => {
    logCall.mockResolvedValue(false);
    await logCallAction(JOB, {}, form([["outcome", "booked"], ["visitAt", "2026-09-20T10:00"]]));
    expect(mirrorToJob).not.toHaveBeenCalled();
  });

  it("does not sync when the call did not save", async () => {
    logCall.mockResolvedValue(false);
    await logCallAction(JOB, {}, form([["outcome", "booked"], ["visitAt", "2026-09-20T10:00"]]));
    await runAfter();
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });

  it("passes the call-back to the save", async () => {
    await expect(logCallAction(JOB, {}, form([
      ["outcome", "no_answer"], ["callBackAt", "2026-10-16T10:00"], ["callBackNote", "checking with husband"],
    ]))).rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}`);
    expect(logCall).toHaveBeenCalledWith(JOB, expect.objectContaining({
      outcome: "no_answer", followUpAt: new Date("2026-10-16T17:00:00Z"), followUpNote: "checking with husband",
    }), "owner@example.com");
  });

  it("keeps the typed call-back when validation fails", async () => {
    const state = await logCallAction(JOB, {}, form([["outcome", "talked"], ["callBackAt", "2026-13-45T25:99"], ["callBackNote", "x"]]));
    expect(state.error).toBe("Pick a valid call-back date and time");
    expect(state.values).toMatchObject({ callBackAt: "2026-13-45T25:99", callBackNote: "x" });
  });
});

describe("callDaySchedule", () => {
  it("is refused without a session and touches nothing", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(callDaySchedule(JOB, "2026-09-20")).rejects.toThrow("NEXT_REDIRECT");
    expect(getDay).not.toHaveBeenCalled();
  });

  it("returns ok:false for an invalid date without calling getDay", async () => {
    expect(await callDaySchedule(JOB, "nope")).toEqual({ ok: false });
    expect(getDay).not.toHaveBeenCalled();
  });

  it("filters out the job's own visit and serializes dates as ISO strings", async () => {
    getDay.mockResolvedValue({
      date: "2026-09-20",
      source: "tracker",
      notice: null,
      items: [
        { key: `${JOB}:consultation`, day: "2026-09-20", allDay: false, start: new Date("2026-09-20T17:00:00Z"),
          end: new Date("2026-09-20T18:00:00Z"), title: "Consultation · This Job", job: { id: JOB, name: "This Job", city: "Reno", status: "visit_booked", kind: "consultation" } },
        { key: "other:consultation", day: "2026-09-20", allDay: false, start: new Date("2026-09-20T20:00:00Z"),
          end: new Date("2026-09-20T21:00:00Z"), title: "Consultation · Other Job", job: { id: "other", name: "Other Job", city: "Reno", status: "visit_booked", kind: "consultation" } },
      ],
    });
    const result = await callDaySchedule(JOB, "2026-09-20");
    expect(result).toEqual({
      ok: true,
      notice: null,
      items: [
        { key: "other:consultation", allDay: false, start: "2026-09-20T20:00:00.000Z", end: "2026-09-20T21:00:00.000Z", title: "Consultation · Other Job" },
      ],
    });
  });

  it("returns ok:false and logs when getDay throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    getDay.mockRejectedValue(new Error("down"));
    expect(await callDaySchedule(JOB, "2026-09-20")).toEqual({ ok: false });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

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

const { logCallAction } = await import("@/app/admin/jobs/call-actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  logCall.mockReset().mockResolvedValue(true);
  redirect.mockClear();
  syncJobCalendar.mockReset();
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
      ["outcome", "talked"], ["treatments", "Shades"], ["treatments", "Blinds"], ["windowCount", "1-5"], ["budget", "value"], ["notes", "Fri pm"],
    ]))).rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}`);
    expect(logCall).toHaveBeenCalledWith(JOB, {
      outcome: "talked", treatments: ["Shades", "Blinds"], windowCount: "1-5", budgetTier: "value", notes: "Fri pm", visitAt: null,
    }, "owner@example.com");
  });

  it("keeps what was typed when validation fails", async () => {
    const state = await logCallAction(JOB, {}, form([["outcome", "booked"], ["treatments", "Shutters"], ["notes", "x"]]));
    expect(state.error).toBe("Pick the visit date and time");
    expect(state.values).toMatchObject({ outcome: "booked", treatments: "Shutters", notes: "x" });
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
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, ["visit"]);
  });

  it("syncs without pushing after any other outcome", async () => {
    await expect(logCallAction(JOB, {}, form([["outcome", "talked"]]))).rejects.toThrow("NEXT_REDIRECT");
    await runAfter();
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB, []);
  });

  it("does not sync when the call did not save", async () => {
    logCall.mockResolvedValue(false);
    await logCallAction(JOB, {}, form([["outcome", "booked"], ["visitAt", "2026-09-20T10:00"]]));
    await runAfter();
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });
});

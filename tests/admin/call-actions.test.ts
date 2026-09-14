import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const logCall = vi.fn();
vi.mock("@/lib/admin/calls", () => ({ logCall }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { logCallAction } = await import("@/app/admin/jobs/call-actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  logCall.mockReset().mockResolvedValue(true);
  redirect.mockClear();
});

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
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const followUps = { setFollowUp: vi.fn(), clearFollowUp: vi.fn() };
vi.mock("@/lib/admin/follow-ups", () => followUps);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { clearFollowUpAction, saveFollowUp } = await import("@/app/admin/jobs/follow-up-actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (e: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(e)) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  followUps.setFollowUp.mockReset().mockResolvedValue(true);
  followUps.clearFollowUp.mockReset().mockResolvedValue(true);
});

describe("saveFollowUp", () => {
  it("checks the session first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveFollowUp(JOB, {}, form({ at: "2026-10-16T10:00" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(followUps.setFollowUp).not.toHaveBeenCalled();
  });
  it("sets the follow-up as the owner", async () => {
    expect(await saveFollowUp(JOB, {}, form({ at: "2026-10-16T10:00", note: " checking " }))).toEqual({ ok: true });
    expect(followUps.setFollowUp).toHaveBeenCalledWith(JOB, new Date("2026-10-16T17:00:00Z"), "checking", "owner@example.com");
  });
  it("keeps what was typed when invalid", async () => {
    const state = await saveFollowUp(JOB, {}, form({ at: "2026-13-45T25:99", note: "x" }));
    expect(state).toEqual({ error: "Pick a valid call-back date and time", values: { at: "2026-13-45T25:99", note: "x" } });
  });
  it("reports a missing job", async () => {
    followUps.setFollowUp.mockResolvedValue(false);
    expect(await saveFollowUp(JOB, {}, form({ at: "2026-10-16T10:00" }))).toEqual({ error: "That job no longer exists." });
  });
});

describe("clearFollowUpAction", () => {
  it("clears as the owner after the session check", async () => {
    await clearFollowUpAction(JOB);
    expect(followUps.clearFollowUp).toHaveBeenCalledWith(JOB, "owner@example.com");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const jobs = { setStage: vi.fn(), getJob: vi.fn(), addNote: vi.fn(), createJob: vi.fn(), updateDetails: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const invite = { autoInvite: vi.fn(), sendPortalInvite: vi.fn() };
vi.mock("@/lib/portal/invite", () => invite);
// The real Outlook sync must never run from these tests.
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar: vi.fn() }));
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode: vi.fn(), markReferralPaid: vi.fn() }));
vi.mock("@/lib/reviews/db", () => ({
  releaseReview: vi.fn(), restoreReviewRequested: vi.fn(), setReviewOptOut: vi.fn(), stampReviewRequested: vi.fn(),
}));
vi.mock("@/lib/reviews/send", () => ({ sendReviewRequest: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCallbacks.push(cb); } }));

const { moveStage, sendPortalInviteNow } = await import("@/app/admin/jobs/actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  afterCallbacks.length = 0;
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  Object.values(jobs).forEach((fn) => fn.mockReset());
  Object.values(invite).forEach((fn) => fn.mockReset());
});

describe("moveStage invites", () => {
  it.each(["quoted", "sold", "ordered", "installed"] as const)("schedules an invite on a move to %s", async (to) => {
    jobs.setStage.mockResolvedValue(true);
    await moveStage(JOB, to);
    await Promise.all(afterCallbacks.map((cb) => cb()));
    expect(invite.autoInvite).toHaveBeenCalledWith(JOB);
  });

  it.each(["new", "contacted", "visit_booked", "lost"] as const)("does not invite on a move to %s", async (to) => {
    jobs.setStage.mockResolvedValue(true);
    await moveStage(JOB, to);
    await Promise.all(afterCallbacks.map((cb) => cb()));
    expect(invite.autoInvite).not.toHaveBeenCalled();
  });

  it("does not invite when nothing changed", async () => {
    jobs.setStage.mockResolvedValue(false);
    await moveStage(JOB, "quoted");
    expect(afterCallbacks).toHaveLength(0);
  });
});

describe("sendPortalInviteNow", () => {
  const job = (over: Record<string, unknown> = {}) => ({ id: JOB, email: "maria@example.com", status: "quoted", ...over });

  it("sends as the signed-in owner", async () => {
    jobs.getJob.mockResolvedValue(job());
    expect(await sendPortalInviteNow(JOB, {}, new FormData())).toEqual({ ok: true });
    expect(invite.sendPortalInvite).toHaveBeenCalledWith(job(), "owner@example.com");
  });

  it("refuses a job without an email", async () => {
    jobs.getJob.mockResolvedValue(job({ email: null }));
    expect((await sendPortalInviteNow(JOB, {}, new FormData())).error).toMatch(/email/);
    expect(invite.sendPortalInvite).not.toHaveBeenCalled();
  });

  it("refuses a job before Quoted, or Lost", async () => {
    for (const status of ["visit_booked", "lost"]) {
      jobs.getJob.mockResolvedValue(job({ status }));
      expect((await sendPortalInviteNow(JOB, {}, new FormData())).error).toMatch(/Quoted/);
    }
    expect(invite.sendPortalInvite).not.toHaveBeenCalled();
  });

  it("reports a failed send", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    jobs.getJob.mockResolvedValue(job());
    invite.sendPortalInvite.mockRejectedValue(new Error("down"));
    expect(await sendPortalInviteNow(JOB, {}, new FormData()))
      .toEqual({ error: "Could not send the invite. Check the settings and try again." });
    consoleError.mockRestore();
  });

  it("returns MISSING for a job that is gone", async () => {
    jobs.getJob.mockResolvedValue(null);
    expect(await sendPortalInviteNow(JOB, {}, new FormData())).toEqual({ error: "That job no longer exists." });
  });
});

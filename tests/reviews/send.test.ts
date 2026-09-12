import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const reviewsDb = {
  listReviewCandidates: vi.fn(), claimReview: vi.fn(), releaseReview: vi.fn(), recordReviewSent: vi.fn(),
};
vi.mock("@/lib/reviews/db", () => reviewsDb);
const ensureReferralCode = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode }));

const { reviewEmailText, runDailyReviewRequests, sendReviewRequest } = await import("@/lib/reviews/send");
const { business } = await import("@/content/business");

const NOW = new Date("2026-09-12T17:00:00Z");
const job = (overrides: Partial<Job> = {}): Job => ({
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Dana Reyes",
  phone: "7025550134", email: "dana@example.com", address: null, city: "Henderson", treatments: [],
  windowCount: null, heardVia: null, notes: null, source: "contact", status: "installed",
  stageChangedAt: new Date("2026-09-11T20:00:00Z"), visitAt: null, quoteCents: null, soldCents: null,
  depositCents: null, brands: [], orderedOn: null, installOn: "2026-09-11", lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
  ...overrides,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  send.mockReset().mockResolvedValue({ error: null });
  Object.values(reviewsDb).forEach((fn) => fn.mockReset());
  reviewsDb.claimReview.mockResolvedValue(true);
  ensureReferralCode.mockReset().mockResolvedValue("K7M2QX");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_REVIEW_URL", "https://g.page/r/example/review");
});

describe("reviewEmailText", () => {
  it("thanks them by first name and carries both links and the reward", () => {
    const text = reviewEmailText({
      firstName: "Dana", reviewUrl: "https://g.page/r/example/review", referralLink: `${business.domain}/r/K7M2QX`,
    });
    expect(text).toMatch(/^Hi Dana,/);
    expect(text).toContain("https://g.page/r/example/review");
    expect(text).toContain(`${business.domain}/r/K7M2QX`);
    expect(text).toContain("$100");
  });
});

describe("sendReviewRequest", () => {
  it("emails the customer from the business and records the send", async () => {
    await sendReviewRequest(job(), "owner@example.com");
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("dana@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.subject).toBe("Thank you from Premier Shade Solutions, Dana");
    expect(message.text).toContain("/r/K7M2QX");
    expect(reviewsDb.recordReviewSent).toHaveBeenCalledWith(job().id, "owner@example.com");
  });

  it("refuses to send without the Google review link", async () => {
    vi.stubEnv("GOOGLE_REVIEW_URL", "");
    await expect(sendReviewRequest(job(), "x")).rejects.toThrow(/GOOGLE_REVIEW_URL/);
    expect(send).not.toHaveBeenCalled();
  });

  it("throws when Resend rejects the message, without recording it", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendReviewRequest(job(), "x")).rejects.toThrow(/domain not verified/);
    expect(reviewsDb.recordReviewSent).not.toHaveBeenCalled();
  });

  it("does not throw when the send succeeds but recording it fails", async () => {
    reviewsDb.recordReviewSent.mockRejectedValue(new Error("Neon down"));
    await expect(sendReviewRequest(job(), "owner@example.com")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("runDailyReviewRequests", () => {
  it("emails each job that is due, and skips the rest", async () => {
    reviewsDb.listReviewCandidates.mockResolvedValue([job(), job({ id: "b", installOn: "2026-09-12" })]);
    expect(await runDailyReviewRequests(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledOnce();
  });

  it("skips a job another run already claimed", async () => {
    reviewsDb.listReviewCandidates.mockResolvedValue([job()]);
    reviewsDb.claimReview.mockResolvedValue(false);
    expect(await runDailyReviewRequests(NOW)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("releases the claim when a send fails, so tomorrow retries", async () => {
    reviewsDb.listReviewCandidates.mockResolvedValue([job()]);
    send.mockResolvedValue({ error: { message: "rate limited" } });
    expect(await runDailyReviewRequests(NOW)).toEqual({ sent: 0, failed: 1 });
    expect(reviewsDb.releaseReview).toHaveBeenCalledWith(job().id);
  });

  it("counts a recorded-send failure as sent and never releases the claim", async () => {
    reviewsDb.listReviewCandidates.mockResolvedValue([job()]);
    reviewsDb.recordReviewSent.mockRejectedValue(new Error("Neon down"));
    expect(await runDailyReviewRequests(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(reviewsDb.releaseReview).not.toHaveBeenCalled();
  });

  it("sends nothing when the Google review link is not set", async () => {
    vi.stubEnv("GOOGLE_REVIEW_URL", "");
    const result = await runDailyReviewRequests(NOW);
    expect(result).toMatchObject({ sent: 0, failed: 0, error: expect.stringMatching(/GOOGLE_REVIEW_URL/) });
    expect(reviewsDb.listReviewCandidates).not.toHaveBeenCalled();
  });
});

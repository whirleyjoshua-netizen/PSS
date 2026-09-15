import { describe, it, expect } from "vitest";
import { lasVegasDate } from "@/lib/admin/time";
import { installDate, isDueForReview, type ReviewCandidate } from "@/lib/reviews/eligibility";

// 17:00 UTC on Sep 12 is 10 a.m. Sep 12 in Las Vegas, when the cron runs.
const NOW = new Date("2026-09-12T17:00:00Z");
const job = (overrides: Partial<ReviewCandidate>): ReviewCandidate => ({
  status: "installed", email: "dana@example.com", reviewRequestedAt: null, reviewOptOut: false,
  installOn: "2026-09-11", stageChangedAt: new Date("2026-09-11T20:00:00Z"), ...overrides,
});

describe("lasVegasDate", () => {
  it("uses the Las Vegas calendar day, not UTC", () => {
    // 03:00 UTC on Sep 12 is still 8 p.m. Sep 11 in Las Vegas.
    expect(lasVegasDate(new Date("2026-09-12T03:00:00Z"))).toBe("2026-09-11");
  });
});

describe("installDate", () => {
  it("prefers the install date the owners entered", () => {
    expect(installDate(job({ installOn: "2026-09-05" }))).toBe("2026-09-05");
  });
  it("falls back to the Las Vegas day the job moved to Installed", () => {
    expect(installDate(job({ installOn: null, stageChangedAt: new Date("2026-09-11T03:00:00Z") }))).toBe("2026-09-10");
  });
});

describe("isDueForReview", () => {
  it("is due the morning after installation", () => {
    expect(isDueForReview(job({}), NOW)).toBe(true);
  });
  it("is due for a completed job too", () => {
    expect(isDueForReview(job({ status: "completed" }), NOW)).toBe(true);
  });
  it("is not due on installation day", () => {
    expect(isDueForReview(job({ installOn: "2026-09-12" }), NOW)).toBe(false);
  });
  it("is still due up to 14 days later, so a failed send is retried", () => {
    expect(isDueForReview(job({ installOn: "2026-08-29" }), NOW)).toBe(true);
  });
  it("is not due after 14 days, so launch does not email every past customer", () => {
    expect(isDueForReview(job({ installOn: "2026-08-28" }), NOW)).toBe(false);
  });
  it("is not due before the job is installed", () => {
    expect(isDueForReview(job({ status: "ordered" }), NOW)).toBe(false);
  });
  it("is not due without an email address", () => {
    expect(isDueForReview(job({ email: null }), NOW)).toBe(false);
  });
  it("is not due once sent", () => {
    expect(isDueForReview(job({ reviewRequestedAt: new Date() }), NOW)).toBe(false);
  });
  it("is not due when the owners turned it off", () => {
    expect(isDueForReview(job({ reviewOptOut: true }), NOW)).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const reviews = await import("@/lib/reviews/db");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("review request records", () => {
  it("lists only installed, unsent, emailable jobs from the last few weeks", async () => {
    await reviews.listReviewCandidates();
    const statement = sql.query.mock.calls[0][0] as string;
    expect(statement).toContain("status = 'installed'");
    expect(statement).toContain("review_requested_at is null");
    expect(statement).toContain("not review_opt_out");
  });

  it("claims a job only if nobody else has", async () => {
    sql.mockResolvedValueOnce([{ id: ID }]);
    expect(await reviews.claimReview(ID)).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("review_requested_at is null");
    expect(await reviews.claimReview(ID)).toBe(false);
  });

  it("records a send with an email event", async () => {
    await reviews.recordReviewSent(ID, "system");
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("review_requested_at = now()");
    expect(statement).toContain("'email'");
  });

  it("turns review requests off and logs it", async () => {
    sql.mockResolvedValueOnce([{ id: "event" }]);
    expect(await reviews.setReviewOptOut(ID, true, "owner@example.com")).toBe(true);
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([true, "owner@example.com"]));
  });

  it("ignores ids that are not uuids", async () => {
    expect(await reviews.claimReview("../etc")).toBe(false);
    expect(await reviews.setReviewOptOut("../etc", true, "x")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

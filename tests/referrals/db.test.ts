import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const referrals = await import("@/lib/referrals/db");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("ensureReferralCode", () => {
  it("returns the existing code without writing", async () => {
    sql.mockResolvedValueOnce([{ referral_code: "K7M2QX" }]);
    expect(await referrals.ensureReferralCode(ID)).toBe("K7M2QX");
    expect(sql).toHaveBeenCalledOnce();
  });

  it("creates a code when the job has none", async () => {
    sql.mockResolvedValueOnce([{ referral_code: null }]);
    sql.mockImplementationOnce(async (_strings: TemplateStringsArray, code: string) => [{ referral_code: code }]);
    const code = await referrals.ensureReferralCode(ID);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(text(sql.mock.calls[1])).toContain("referral_code is null");
  });

  it("retries when a new code collides with another job's", async () => {
    sql.mockResolvedValueOnce([{ referral_code: null }]);
    sql.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }));
    sql.mockImplementationOnce(async (_strings: TemplateStringsArray, code: string) => [{ referral_code: code }]);
    expect(await referrals.ensureReferralCode(ID)).toMatch(/^[A-Z2-9]{6}$/);
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it("returns null for a missing job or a non-uuid id", async () => {
    expect(await referrals.ensureReferralCode(ID)).toBeNull();
    expect(await referrals.ensureReferralCode("../etc")).toBeNull();
  });
});

describe("findReferrer", () => {
  it("resolves a retyped code to the job and its first name", async () => {
    sql.mockResolvedValueOnce([{ id: ID, referral_code: "K7M2QX", name: "Sarah Lopez" }]);
    expect(await referrals.findReferrer(" k7m2qx ")).toEqual({ id: ID, code: "K7M2QX", firstName: "Sarah" });
    expect(sql.mock.calls[0]).toContain("K7M2QX");
  });

  it("returns null for a malformed code without querying", async () => {
    expect(await referrals.findReferrer("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns null for an unknown code", async () => {
    expect(await referrals.findReferrer("K7M2QX")).toBeNull();
  });
});

describe("listReferrals", () => {
  it("lists referred jobs with their reward status", async () => {
    sql.mockResolvedValueOnce([
      { id: "a", name: "Ana", status: "sold", referral_paid_at: null },
      { id: "b", name: "Ben", status: "installed", referral_paid_at: null },
      { id: "c", name: "Cy", status: "installed", referral_paid_at: new Date("2026-09-01T00:00:00Z") },
    ]);
    const list = await referrals.listReferrals(ID);
    expect(list.map((r) => r.reward)).toEqual(["pending", "owed", "paid"]);
  });
});

describe("markReferralPaid", () => {
  it("pays and logs on the referrer's job in one statement", async () => {
    sql.mockResolvedValueOnce([{ id: "event" }]);
    expect(await referrals.markReferralPaid(ID, "owner@example.com")).toBe(true);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("status = 'installed'");
    expect(statement).toContain("referral_paid_at is null");
    expect(statement).toContain("insert into job_events");
  });

  it("returns false when the reward is not owed", async () => {
    expect(await referrals.markReferralPaid(ID, "owner@example.com")).toBe(false);
  });
});

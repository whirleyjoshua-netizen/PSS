import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { logCall } = await import("@/lib/admin/calls");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const input = { outcome: "booked" as const, treatments: ["Shutters"], windowCount: "6-10", budgetTier: "mid" as const,
  notes: "Gate code 1234", visitAt: new Date("2026-10-14T21:00:00Z"), followUpAt: null, followUpNote: null };

beforeEach(() => { query.mockReset().mockResolvedValue([{ id: "e1" }]); });

describe("logCall", () => {
  it("saves answers, the forward-only move and both events in one statement", async () => {
    expect(await logCall(JOB, input, "owner@example.com")).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("treatments = $2::text[]");
    expect(text).toContain("budget_tier = $4");
    expect(text).toContain("coalesce($5::timestamptz, visit_at)");
    expect(text).toContain("status = any($7::text[])");
    expect(text).toContain("where updated.status = $6::text and prev.status <> $6::text");
    expect(text).toContain("'note'");
    expect(text).toContain("follow_up_at = $10::timestamptz");
    expect(text).toContain("follow_up_note = $11");
    expect(params).toEqual([
      JOB, ["Shutters"], "6-10", "mid", input.visitAt, "visit_booked", ["new", "contacted"], "owner@example.com",
      "Call: booked visit Wed 10/14, 2:00 PM · Shutters · 6-10 windows · Mid-range\nGate code 1234",
      null, null,
    ]);
  });

  it("moves talked calls only from new", async () => {
    await logCall(JOB, { ...input, outcome: "talked", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(4, 7)).toEqual([null, "contacted", ["new"]]);
    expect(params[8]).toBe("Call: talked, no visit yet · Shutters · 6-10 windows · Mid-range");
  });

  it("never moves on no answer, but still saves what was learned", async () => {
    await logCall(JOB, { ...input, outcome: "no_answer", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(1, 7)).toEqual([["Shutters"], "6-10", "mid", null, null, []]);
  });

  it("passes the follow-up time and note when set on a no-answer call", async () => {
    const followUpAt = new Date("2026-10-16T17:00:00Z");
    await logCall(JOB, { ...input, outcome: "no_answer", visitAt: null, notes: null, followUpAt, followUpNote: "checking with husband" }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(9, 11)).toEqual([followUpAt, "checking with husband"]);
  });

  it("passes null, null for the follow-up on a booked call", async () => {
    await logCall(JOB, input, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(9, 11)).toEqual([null, null]);
  });

  it("returns false for a missing job or a bad id", async () => {
    query.mockResolvedValue([]);
    expect(await logCall(JOB, input, "o@example.com")).toBe(false);
    query.mockClear();
    expect(await logCall("nope", input, "o@example.com")).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

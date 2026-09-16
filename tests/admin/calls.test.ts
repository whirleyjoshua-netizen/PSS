import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { logCall } = await import("@/lib/admin/calls");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const input = { outcome: "booked" as const, treatmentTypes: ["shutters" as const], motorized: true, windowCountExact: 8, gateCode: "#4321",
  budgetTier: "mid" as const, notes: "Dog in yard", visitAt: new Date("2026-10-14T21:00:00Z"), followUpAt: null, followUpNote: null };

beforeEach(() => { query.mockReset().mockResolvedValue([{ id: "e1" }]); });

describe("logCall", () => {
  it("saves answers, the forward-only move and both events in one statement", async () => {
    expect(await logCall(JOB, input, "owner@example.com")).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("treatment_types = $2::text[], motorized = $3, window_count_exact = $4, gate_code = $5, budget_tier = $6");
    expect(text).not.toMatch(/\btreatments =|\bwindow_count =/);
    // leads.visit_at is a mirror of the confirmed consultation now; the call statement must not write it.
    expect(text).not.toContain("visit_at");
    // The booked visit becomes a CONFIRMED consultation, in the same statement as the stage move.
    expect(text).toContain("insert into appointments");
    expect(text).toContain("'consultation'");
    expect(text).toContain("where $7::timestamptz is not null");
    expect(text).toMatch(/confirmed_at = now\(\)/);
    // A call has no timing inputs, so re-booking by call clears any window and length left from before.
    expect(text.replace(/\s+/g, " ")).toMatch(
      /on conflict \(lead_id, kind\) do update set[^;]*window_start = null, window_end = null, duration_minutes = null/,
    );
    expect(text).toContain("status = any($9::text[])");
    expect(text).toContain("where updated.status = $8::text and prev.status <> $8::text");
    expect(text).toContain("'note'");
    expect(text).toContain("follow_up_at = $12::timestamptz");
    expect(text).toContain("follow_up_note = $13");
    expect(params).toEqual([
      JOB, ["shutters"], true, 8, "#4321", "mid", input.visitAt, "visit_booked", ["new"], "owner@example.com",
      "Call: booked visit Wed 10/14, 2:00 PM · Shutters · Motorized · 8 windows · Mid-range\nDog in yard",
      null, null,
    ]);
  });

  it("never moves a talked call", async () => {
    await logCall(JOB, { ...input, outcome: "talked", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(6, 9)).toEqual([null, null, []]);
    expect(params[10]).toBe("Call: talked, no visit yet · Shutters · Motorized · 8 windows · Mid-range");
  });

  it("never moves on no answer, but still saves what was learned", async () => {
    await logCall(JOB, { ...input, outcome: "no_answer", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(1, 9)).toEqual([["shutters"], true, 8, "#4321", "mid", null, null, []]);
  });

  it("passes the follow-up time and note when set on a no-answer call", async () => {
    const followUpAt = new Date("2026-10-16T17:00:00Z");
    await logCall(JOB, { ...input, outcome: "no_answer", visitAt: null, notes: null, followUpAt, followUpNote: "checking with husband" }, "o@example.com");
    expect(query.mock.calls[0][1].slice(11, 13)).toEqual([followUpAt, "checking with husband"]);
  });

  it("passes null, null for the follow-up on a booked call", async () => {
    await logCall(JOB, input, "o@example.com");
    expect(query.mock.calls[0][1].slice(11, 13)).toEqual([null, null]);
  });

  it("books no consultation for a non-booked outcome that somehow carries a date", async () => {
    await logCall(JOB, { ...input, outcome: "talked" }, "o@example.com");
    expect(query.mock.calls[0][1][6]).toBeNull();
  });

  it("books no consultation for a booked call with no date", async () => {
    await logCall(JOB, { ...input, visitAt: null }, "o@example.com");
    expect(query.mock.calls[0][1][6]).toBeNull();
  });

  it("returns false for a missing job or a bad id", async () => {
    query.mockResolvedValue([]);
    expect(await logCall(JOB, input, "o@example.com")).toBe(false);
    query.mockClear();
    expect(await logCall("nope", input, "o@example.com")).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

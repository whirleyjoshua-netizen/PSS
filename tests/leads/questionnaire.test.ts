import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { findQuestionnaire, saveQuestionnaire } = await import("@/lib/leads/questionnaire");

const KEY = "k".repeat(43);
const HASH = createHash("sha256").update(KEY).digest("hex");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const answers = { windowCountExact: 12, treatmentTypes: ["shutters" as const], motorized: true, address: "12 Sample St", gateCode: "#4321", finish: "luxury" as const };

beforeEach(() => { sql.mockReset(); });

describe("findQuestionnaire", () => {
  it("finds nothing without a key, and never queries", async () => {
    expect(await findQuestionnaire(undefined)).toBeNull();
    expect(await findQuestionnaire("")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
  it("looks the lead up by the key's hash and a future expiry", async () => {
    sql.mockResolvedValue([{ window_count: "6-10", window_count_exact: 12, treatment_types: ["shutters", "junk"], motorized: true,
      address: "12 Sample St", gate_code: "#4321", finish: "luxury" }]);
    expect(await findQuestionnaire(KEY)).toEqual({ windowRange: "6-10", answers });
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("where questionnaire_token_hash = ? and questionnaire_expires_at > now()");
    expect(text(call)).not.toMatch(/\b(name|phone|email|notes)\b/);
    expect(call).toContain(HASH);
    expect(call).not.toContain(KEY);
  });
  it("finds nothing for a wrong or expired key", async () => {
    sql.mockResolvedValue([]);
    expect(await findQuestionnaire(KEY)).toBeNull();
  });
});

describe("saveQuestionnaire", () => {
  it("updates only questionnaire fields and logs a note, in one statement", async () => {
    sql.mockResolvedValue([{ id: "e1" }]);
    expect(await saveQuestionnaire(KEY, answers)).toBe(true);
    expect(sql).toHaveBeenCalledOnce();
    const call = sql.mock.calls[0];
    const statement = text(call);
    expect(statement).toContain("where questionnaire_token_hash = ? and questionnaire_expires_at > now()");
    expect(statement).toContain("address = coalesce(?::text, address)");
    expect(statement).toContain("budget_tier = coalesce(?::text, budget_tier)");
    expect(statement).toContain("'note'");
    expect(statement).not.toContain("status");
    expect(call).toContain(HASH);
    expect(call).toContain("premium");
    expect(call).toContain("Customer added details: 12 windows · Shutters · Motorized · Luxury");
  });
  it("leaves the tier alone for not sure", async () => {
    sql.mockResolvedValue([{ id: "e1" }]);
    await saveQuestionnaire(KEY, { ...answers, finish: "not_sure" });
    expect(sql.mock.calls[0]).not.toContain("premium");
  });
  it("returns false when the key is wrong or expired", async () => {
    sql.mockResolvedValue([]);
    expect(await saveQuestionnaire(KEY, answers)).toBe(false);
  });
});

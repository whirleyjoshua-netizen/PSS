import { beforeEach, describe, expect, it, vi } from "vitest";
const sql = { query: vi.fn() };
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { businessCounts, BUSINESS_COUNT_KEYS } = await import("@/lib/agents/stats");

beforeEach(() => {
  sql.query.mockReset()
    .mockResolvedValueOnce([{ leads: "5", ad_click_leads: "2", referral_leads: "1" }])
    .mockResolvedValueOnce([{ source: "contact", n: "3" }, { source: "google_form", n: "2" }])
    .mockResolvedValueOnce([{ heard_via: "Google search", n: "2" }, { heard_via: "My neighbor Maria Lopez", n: "1" }, { heard_via: null, n: "2" }])
    .mockResolvedValueOnce([{ booked: "2", sales: "1", revenue_cents: "450000" }]);
});

describe("businessCounts", () => {
  it("returns only counts, with free-text answers folded into Other", async () => {
    const counts = await businessCounts(7);
    expect(Object.keys(counts).sort()).toEqual([...BUSINESS_COUNT_KEYS].sort());
    expect(counts).toEqual({
      window_days: 7, leads: 5, ad_click_leads: 2, referral_leads: 1,
      leads_by_source: { contact: 3, google_form: 2 },
      leads_by_heard_via: { "Google search": 2, Other: 1, "Not answered": 2 },
      consultations_booked: 2, sales: 1, revenue_cents: 450000,
    });
    expect(JSON.stringify(counts)).not.toContain("Maria");
  });
  it("never selects a personal column", async () => {
    await businessCounts(28);
    const all = sql.query.mock.calls.map((c) => c[0] as string).join(" ");
    for (const col of ["name", "phone", "email", "address", "notes"]) expect(all).not.toMatch(new RegExp(`\\b(l\\.)?${col}\\b`));
    expect(sql.query.mock.calls[0][1]).toContain(28);
  });
});

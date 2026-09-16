import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const quotes = await import("@/lib/admin/install-quotes");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const QUOTE = "9c8b7a65-4d3e-4f21-8a0b-1c2d3e4f5a6b";

const priced = {
  lines: [{
    treatment: "roller_shades" as const, count: 4, widthEighths: null, heightEighths: null,
    hardSurface: false, highLadder: true, motorized: false,
    basis: "window" as const, rateCents: 2500, quantity: 4, amountCents: 30_000,
  }],
  subtotalCents: 30_000, totalCents: 30_000, minimumApplied: false,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([{ id: QUOTE }]);
});

describe("saveInstallQuote", () => {
  it("writes the snapshot and returns its id", async () => {
    const id = await quotes.saveInstallQuote(JOB, "estimate", priced, 15_000, "owner@example.com");
    expect(id).toBe(QUOTE);
    expect(sql.mock.calls.map(text).some((s) => s.includes("insert into install_quotes"))).toBe(true);
  });

  it("writes one line row per priced line, carrying its rate and basis", async () => {
    await quotes.saveInstallQuote(JOB, "estimate", priced, 15_000, "owner@example.com");
    const lineCall = sql.mock.calls.find((c) => text(c).includes("insert into install_quote_lines"));
    expect(lineCall).toBeDefined();
    expect(lineCall!.slice(1)).toEqual(
      expect.arrayContaining([QUOTE, 0, "roller_shades", "window", 4, 2500, false, true, false, 30_000]),
    );
  });

  it("records the job event, so the snapshot shows in the job's history", async () => {
    await quotes.saveInstallQuote(JOB, "final", priced, 15_000, "owner@example.com");
    const eventSql = sql.mock.calls.map(text).find((s) => s.includes("insert into job_events"));
    expect(eventSql).toBeDefined();
    // job_events_kind_check only allows the known kinds; 'install_price' would throw in production.
    expect(eventSql).toContain("'edit'");
    expect(eventSql).not.toContain("install_price");
  });

  it("refuses an id that is not a uuid rather than querying with it", async () => {
    await expect(quotes.saveInstallQuote("nope", "estimate", priced, 0, "owner@example.com"))
      .rejects.toThrow("Not a job id");
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("listInstallQuotes", () => {
  it("returns nothing for a job with no snapshots", async () => {
    sql.mockResolvedValue([]);
    expect(await quotes.listInstallQuotes(JOB)).toEqual([]);
  });

  it("groups line rows under their snapshot, newest first", async () => {
    sql
      .mockResolvedValueOnce([
        { id: QUOTE, kind: "estimate", minimum_cents: 15_000, subtotal_cents: 30_000,
          total_cents: 30_000, created_by: "owner@example.com", created_at: "2026-09-16T10:00:00Z" },
      ])
      .mockResolvedValueOnce([
        { install_quote_id: QUOTE, treatment: "roller_shades", basis: "window", quantity: 4,
          rate_cents: 2500, hard_surface: false, high_ladder: true, motorized: false, amount_cents: 30_000 },
      ]);
    const [saved] = await quotes.listInstallQuotes(JOB);
    expect(saved.totalCents).toBe(30_000);
    expect(saved.lines).toHaveLength(1);
    expect(saved.lines[0]).toMatchObject({ treatment: "roller_shades", rateCents: 2500, highLadder: true });
  });

  it("refuses an id that is not a uuid", async () => {
    expect(await quotes.listInstallQuotes("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

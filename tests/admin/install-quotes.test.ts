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
  // A distinct $75 measuring fee, so a column swap between subtotal, fee and total cannot pass.
  subtotalCents: 30_000, measureCents: 7500, totalCents: 37_500, minimumApplied: false,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([{ id: QUOTE }]);
});

describe("saveInstallQuote", () => {
  it("writes the whole snapshot in exactly one statement and returns its id", async () => {
    const id = await quotes.saveInstallQuote(JOB, "estimate", priced, 15_000, "owner@example.com");
    expect(id).toBe(QUOTE);
    // One statement is all-or-nothing; splitting the writes apart again would allow half-saved snapshots.
    expect(sql).toHaveBeenCalledTimes(1);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("insert into install_quotes");
    expect(statement).toContain("insert into install_quote_lines");
    expect(statement).toContain("unnest(");
    expect(statement).toContain("insert into job_events");
  });

  it("binds the quote and each line column in exact order", async () => {
    await quotes.saveInstallQuote(JOB, "estimate", priced, 15_000, "owner@example.com");
    expect(sql.mock.calls[0].slice(1)).toEqual([
      JOB, "estimate", 15_000, 30_000, 7500, 37_500, "owner@example.com",
      [0], ["roller_shades"], ["window"], [4], [2500], [false], [true], [false], [30_000],
      "owner@example.com", "Estimate installation price: $375",
    ]);
  });

  it("records the job event, so the snapshot shows in the job's history", async () => {
    await quotes.saveInstallQuote(JOB, "final", priced, 15_000, "owner@example.com");
    const statement = text(sql.mock.calls[0]);
    // job_events_kind_check only allows the known kinds; 'install_price' would throw in production.
    expect(statement).toMatch(/insert into job_events .*'edit'/);
    expect(statement).not.toContain("install_price");
  });

  it("still writes the quote and event when there are no lines", async () => {
    const id = await quotes.saveInstallQuote(JOB, "estimate", { ...priced, lines: [] }, 0, "owner@example.com");
    expect(id).toBe(QUOTE);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0].slice(8, 17)).toEqual([[], [], [], [], [], [], [], [], []]);
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
        { id: QUOTE, kind: "estimate", minimum_cents: 15_000, subtotal_cents: 30_000, measure_cents: 7500,
          total_cents: 37_500, created_by: "owner@example.com", created_at: "2026-09-16T10:00:00Z" },
      ])
      .mockResolvedValueOnce([
        { install_quote_id: QUOTE, treatment: "roller_shades", basis: "window", quantity: 4,
          rate_cents: 2500, hard_surface: false, high_ladder: true, motorized: false, amount_cents: 30_000 },
      ]);
    const [saved] = await quotes.listInstallQuotes(JOB);
    expect(saved.totalCents).toBe(37_500);
    expect(saved.measureCents).toBe(7500);
    expect(saved.lines).toHaveLength(1);
    expect(saved.lines[0]).toMatchObject({ treatment: "roller_shades", rateCents: 2500, highLadder: true });
  });

  it("gives each snapshot only its own lines, whatever order the line rows arrive in", async () => {
    const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const lineRow = (quoteId: string, treatment: string, amount: number) => ({
      install_quote_id: quoteId, treatment, basis: "window", quantity: 1,
      rate_cents: amount, hard_surface: false, high_ladder: false, motorized: false, amount_cents: amount,
    });
    sql
      .mockResolvedValueOnce([
        { id: QUOTE, kind: "final", minimum_cents: 0, subtotal_cents: 300, measure_cents: 0, total_cents: 300,
          created_by: "owner@example.com", created_at: "2026-09-16T10:00:00Z" },
        { id: OTHER, kind: "estimate", minimum_cents: 0, subtotal_cents: 700, measure_cents: 0, total_cents: 700,
          created_by: "owner@example.com", created_at: "2026-09-10T10:00:00Z" },
      ])
      .mockResolvedValueOnce([
        lineRow(OTHER, "shutters", 300),
        lineRow(QUOTE, "roller_shades", 100),
        lineRow(OTHER, "roman_shades", 400),
        lineRow(QUOTE, "cellular_shades", 200),
      ]);
    const saved = await quotes.listInstallQuotes(JOB);
    expect(saved.map((quote) => quote.id)).toEqual([QUOTE, OTHER]);
    expect(saved[0].lines.map((line) => line.treatment)).toEqual(["roller_shades", "cellular_shades"]);
    expect(saved[1].lines.map((line) => line.treatment)).toEqual(["shutters", "roman_shades"]);
  });

  it("reads snapshots from their own stored figures, never from the current rates", async () => {
    sql
      .mockResolvedValueOnce([
        { id: QUOTE, kind: "estimate", minimum_cents: 0, subtotal_cents: 100, measure_cents: 0, total_cents: 100,
          created_by: "owner@example.com", created_at: "2026-09-16T10:00:00Z" },
      ])
      .mockResolvedValueOnce([]);
    await quotes.listInstallQuotes(JOB);
    // A snapshot joined to install_rates would silently change when a rate changed.
    expect(sql).toHaveBeenCalledTimes(2);
    for (const call of sql.mock.calls) expect(text(call)).not.toContain("install_rates");
  });

  it("refuses an id that is not a uuid", async () => {
    expect(await quotes.listInstallQuotes("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const rates = await import("@/lib/admin/install-rates");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

describe("listInstallRates", () => {
  it("reads every configured rate", async () => {
    sql.mockResolvedValue([{ treatment: "roller_shades", basis: "window", rate_cents: 2500 }]);
    expect(await rates.listInstallRates()).toEqual([
      { treatment: "roller_shades", basis: "window", rateCents: 2500 },
    ]);
  });

  it("returns nothing when no rate has been set yet", async () => {
    expect(await rates.listInstallRates()).toEqual([]);
  });
});

describe("getInstallSettings", () => {
  it("reads the single settings row", async () => {
    sql.mockResolvedValue([{
      minimum_cents: 15_000, hard_surface_cents: 1000, high_ladder_cents: 5000, motorized_cents: 1500,
    }]);
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500,
    });
  });

  it("falls back to zeroes when the row is somehow missing", async () => {
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0,
    });
  });
});

describe("saveInstallRates", () => {
  it("upserts each rate and the settings row", async () => {
    await rates.saveInstallRates(
      [{ treatment: "roller_shades", basis: "window", rateCents: 2500 }],
      { minimumCents: 15_000, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0 },
      "owner@example.com",
    );
    const statements = sql.mock.calls.map(text);
    expect(statements.some((s) => s.includes("insert into install_rates") && s.includes("on conflict"))).toBe(true);
    expect(statements.some((s) => s.includes("update install_settings"))).toBe(true);
  });

  it("writes no job event, because rates belong to the business rather than to one job", async () => {
    await rates.saveInstallRates([], { minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0 }, "owner@example.com");
    expect(sql.mock.calls.map(text).some((s) => s.includes("insert into job_events"))).toBe(false);
  });
});

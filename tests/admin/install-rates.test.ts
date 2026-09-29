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
      minimum_cents: 15_000, hard_surface_cents: 1000, high_ladder_cents: 5000, motorized_cents: 1500, measure_cents: 7500,
      takedown_cents: 1860, shutter_takedown_cents: 233, app_setup_small_cents: 6975, app_setup_large_cents: 15_113,
    }]);
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, measureCents: 7500,
      takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113,
    });
  });

  it("falls back to zeroes when the row is somehow missing", async () => {
    expect(await rates.getInstallSettings()).toEqual({
      minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0,
      takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0,
    });
  });
});

describe("saveInstallRates", () => {
  it("upserts each rate, deletes cleared ones, and updates settings in one statement", async () => {
    await rates.saveInstallRates(
      [
        { treatment: "roller_shades", basis: "window", rateCents: 2500 },
        { treatment: "shutters", basis: "sq_ft", rateCents: 300 },
      ],
      { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, measureCents: 7500, takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113 },
      "owner@example.com",
    );
    expect(sql).toHaveBeenCalledTimes(1);
    const [call] = sql.mock.calls;
    const statement = text(call);
    expect(statement).toContain("delete from install_rates where not (treatment = any(");
    expect(statement).toMatch(/insert into install_rates .* on conflict/);
    expect(statement).toContain("update install_settings");
    // Every bound value in order: the kept-treatment list the delete checks, the upsert's
    // three arrays, then each settings value and the actor.
    expect(call.slice(1)).toEqual([
      ["roller_shades", "shutters"],
      ["roller_shades", "shutters"], ["window", "sq_ft"], [2500, 300],
      15_000, 1000, 5000, 1500, 7500, 1860, 233, 6975, 15_113,
      "owner@example.com",
    ]);
  });

  it("deletes every rate when none is priced", async () => {
    await rates.saveInstallRates([], { minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0, takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0 }, "owner@example.com");
    const [call] = sql.mock.calls;
    expect(text(call)).toContain("delete from install_rates where not (treatment = any(");
    expect(call[1]).toEqual([]);
  });

  it("stores who saved the rates on the settings row", async () => {
    await rates.saveInstallRates([], { minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0, takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0 }, "owner@example.com");
    const update = sql.mock.calls.find((call) => text(call).includes("update install_settings"));
    expect(update && text(update)).toContain("updated_by");
    expect(update?.slice(1)).toContain("owner@example.com");
  });

  it("writes no job event, because rates belong to the business rather than to one job", async () => {
    await rates.saveInstallRates([], { minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0, takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0 }, "owner@example.com");
    expect(sql.mock.calls.map(text).some((s) => s.includes("insert into job_events"))).toBe(false);
  });
});

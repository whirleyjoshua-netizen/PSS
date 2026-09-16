import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { getRouteSettings, saveRouteSettings, defaultMinutes, DEFAULT_ROUTE_SETTINGS } = await import("@/lib/routes/settings");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

beforeEach(() => { sql.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("route settings", () => {
  it("reads the single row, trimming seconds from the times", async () => {
    sql.mockResolvedValue([{ day_start: "08:30:00", day_end: "17:00:00", consultation_minutes: 45,
      measure_minutes: 60, install_minutes: 300, service_minutes: 90 }]);
    expect(await getRouteSettings()).toEqual({
      dayStart: "08:30", dayEnd: "17:00",
      minutes: { consultation: 45, measure: 60, install: 300, service: 90 },
    });
  });

  it("falls back to the defaults when the row or table is missing", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await getRouteSettings()).toEqual(DEFAULT_ROUTE_SETTINGS);
    sql.mockRejectedValueOnce(new Error('relation "route_settings" does not exist'));
    expect(await getRouteSettings()).toEqual(DEFAULT_ROUTE_SETTINGS);
  });

  it("upserts the single row", async () => {
    sql.mockResolvedValue([]);
    await saveRouteSettings({ dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } });
    expect(text(sql.mock.calls[0])).toContain("insert into route_settings");
    expect(text(sql.mock.calls[0])).toContain("on conflict (id) do update set");
  });

  it("gives each kind its default length", () => {
    expect(defaultMinutes(DEFAULT_ROUTE_SETTINGS, "install")).toBe(240);
    expect(DEFAULT_ROUTE_SETTINGS).toEqual({ dayStart: "09:00", dayEnd: "18:00",
      minutes: { consultation: 60, measure: 60, install: 240, service: 90 } });
  });
});

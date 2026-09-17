import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { geocodeAddress, geocodeLead, geocodeQuery } = await import("@/lib/routes/geocode");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GOOGLE_GEOCODING_KEY", "server-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("geocodeAddress", () => {
  it("asks Google for the Nevada address, restricted to the US", async () => {
    fetchMock.mockResolvedValue(json({ status: "OK", results: [{ geometry: { location: { lat: 36.03, lng: -115.04 } } }] }));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "ok", lat: 36.03, lng: -115.04 });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url.searchParams.get("address")).toBe("12 Sample St, Henderson, NV");
    expect(url.searchParams.get("components")).toBe("country:US");
    expect(url.searchParams.get("key")).toBe("server-key");
  });

  it("reports zero results as not found", async () => {
    fetchMock.mockResolvedValue(json({ status: "ZERO_RESULTS", results: [] }));
    expect(await geocodeAddress("nowhere", "Henderson")).toEqual({ status: "not_found" });
  });

  it("reports quota, denial, network failure and missing config as errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: "OVER_QUERY_LIMIT", results: [] }));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
    vi.stubEnv("GOOGLE_GEOCODING_KEY", "");
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
  });

  it("reports OK with no results as an error", async () => {
    fetchMock.mockResolvedValue(json({ status: "OK", results: [] }));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
  });

  it("reports a non-JSON error page as an error", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
  });

  it("never geocodes a job with no street address to the city centre", async () => {
    expect(await geocodeAddress(null, "Henderson")).toEqual({ status: "not_found" });
    expect(await geocodeAddress("  ", "Henderson")).toEqual({ status: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the query text", () => {
    expect(geocodeQuery(" 12 Sample St ", "Henderson")).toBe("12 Sample St, Henderson, NV");
  });
});

describe("geocodeLead", () => {
  it("stores coordinates only, never the address", async () => {
    sql.mockResolvedValueOnce([{ address: "12 Sample St", city: "Henderson" }]);
    fetchMock.mockResolvedValue(json({ status: "OK", results: [{ geometry: { location: { lat: 1, lng: 2 } } }] }));
    await geocodeLead(ID);
    const update = text(sql.mock.calls[1]);
    expect(update).toContain("update leads set lat = ?, lng = ?, geocode_status = ?, geocoded_at = now()");
    expect(update).not.toMatch(/address\s*=|city\s*=|updated_at/);
  });

  it("stamps not_found and error without coordinates", async () => {
    sql.mockResolvedValueOnce([{ address: null, city: "Henderson" }]);
    await geocodeLead(ID);
    expect(sql.mock.calls[1].slice(1, 5)).toEqual([null, null, "not_found", ID]);
  });

  it("stamps error with no coordinates when the request fails", async () => {
    sql.mockResolvedValueOnce([{ address: "12 Sample St", city: "Henderson" }]);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await geocodeLead(ID);
    expect(sql.mock.calls[1].slice(1, 5)).toEqual([null, null, "error", ID]);
  });

  it("writes only if the address and city are still the ones looked up", async () => {
    sql.mockResolvedValueOnce([{ address: "12 Sample St", city: "Henderson" }]);
    fetchMock.mockResolvedValue(json({ status: "OK", results: [{ geometry: { location: { lat: 1, lng: 2 } } }] }));
    await geocodeLead(ID);
    const update = text(sql.mock.calls[1]);
    expect(update).toContain("where id = ? and address is not distinct from ?::text and city is not distinct from ?::text");
    expect(sql.mock.calls[1].slice(4)).toEqual([ID, "12 Sample St", "Henderson"]);
  });

  it("without a geocoding key, never touches the database and only warns once", async () => {
    vi.stubEnv("GOOGLE_GEOCODING_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockClear();
    await geocodeLead(ID);
    expect(sql).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("does nothing for a bad id or a missing job, and never throws", async () => {
    await geocodeLead("nope");
    expect(sql).not.toHaveBeenCalled();
    sql.mockRejectedValueOnce(new Error("db down"));
    await expect(geocodeLead(ID)).resolves.toBeUndefined();
  });
});

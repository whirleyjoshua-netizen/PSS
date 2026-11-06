// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const conversionsCsvNow = vi.fn();
vi.mock("@/lib/leads/conversions-feed", () => ({ conversionsCsvNow }));
const all = await import("@/app/api/ads/conversions/route");
const consultation = await import("@/app/api/ads/conversions/consultation.csv/route");
const booked = await import("@/app/api/ads/conversions/booked.csv/route");
const sale = await import("@/app/api/ads/conversions/sale.csv/route");

const USER = "google-ads-feed-user";
const PASSWORD = "a-long-random-feed-password";
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const request = (auth?: string) =>
  new Request("https://premiershadesolutions.com/api/ads/conversions/sale.csv", auth ? { headers: { authorization: auth } } : {});

beforeEach(() => {
  conversionsCsvNow.mockReset().mockResolvedValue("csv\n");
  vi.stubEnv("ADS_FEED_USER", USER);
  vi.stubEnv("ADS_FEED_PASSWORD", PASSWORD);
});
afterEach(() => { vi.unstubAllEnvs(); });

const routes = [
  ["consultation.csv", consultation, "lead"],
  ["booked.csv", booked, "booked"],
  ["sale.csv", sale, "sale"],
] as const;

describe("one address per conversion action, for Data Manager (owner 2026-11-05)", () => {
  it.each(routes)("%s serves only its own action to the right credentials", async (_path, route, kind) => {
    expect(route.dynamic).toBe("force-dynamic");
    const response = await route.GET(request(basic(USER, PASSWORD)));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(conversionsCsvNow).toHaveBeenCalledWith(kind);
  });

  it.each(routes)("%s is locked like the full feed: 401 on a wrong password, 404 when unconfigured", async (_path, route) => {
    expect((await route.GET(request(basic(USER, "a-long-random-feed-passwore")))).status).toBe(401);
    expect((await route.GET(request())).status).toBe(401);
    vi.stubEnv("ADS_FEED_PASSWORD", "short");
    expect((await route.GET(request(basic(USER, "short")))).status).toBe(404);
    expect(conversionsCsvNow).not.toHaveBeenCalled();
  });

  it("the full feed still serves every action", async () => {
    await all.GET(request(basic(USER, PASSWORD)));
    expect(conversionsCsvNow).toHaveBeenCalledWith(undefined);
  });
});

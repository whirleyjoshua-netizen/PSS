// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const conversionsCsvNow = vi.fn();
vi.mock("@/lib/leads/conversions-feed", () => ({ conversionsCsvNow }));
const route = await import("@/app/api/ads/conversions/route");
const { GET } = route;

const USER = "google-ads-feed-user";
const PASSWORD = "a-long-random-feed-password";
const CSV = "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\nx,Sale,2026-09-20 18:30:00+00:00,,\n";
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const call = (auth?: string) =>
  GET(new Request("https://premiershadesolutions.com/api/ads/conversions", auth ? { headers: { authorization: auth } } : {}));

beforeEach(() => {
  conversionsCsvNow.mockReset().mockResolvedValue(CSV);
  vi.stubEnv("ADS_FEED_USER", USER);
  vi.stubEnv("ADS_FEED_PASSWORD", PASSWORD);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("ads conversions feed", () => {
  it("is never prerendered or cached", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  describe("off unless both credentials are set and at least 16 characters", () => {
    it.each([
      ["user missing", "ADS_FEED_USER", undefined],
      ["password missing", "ADS_FEED_PASSWORD", undefined],
      ["user empty", "ADS_FEED_USER", ""],
      ["user short", "ADS_FEED_USER", "fifteen-chars-x"],
      ["password short", "ADS_FEED_PASSWORD", "fifteen-chars-x"],
    ])("404 when %s, even with matching credentials", async (_label, name, value) => {
      vi.stubEnv(name, value);
      const user = name === "ADS_FEED_USER" ? value ?? "" : USER;
      const password = name === "ADS_FEED_PASSWORD" ? value ?? "" : PASSWORD;
      const response = await call(basic(user, password));
      expect(response.status).toBe(404);
      expect(response.headers.get("www-authenticate")).toBeNull();
      expect(await response.text()).toBe("");
      expect(conversionsCsvNow).not.toHaveBeenCalled();
    });

    it("404 with no header either, so an unconfigured feed looks like no route", async () => {
      vi.stubEnv("ADS_FEED_PASSWORD", undefined);
      expect((await call()).status).toBe(404);
    });

    it("serves at exactly 16 characters", async () => {
      vi.stubEnv("ADS_FEED_USER", "sixteen-chars-xx");
      vi.stubEnv("ADS_FEED_PASSWORD", "sixteen-chars-yy");
      expect((await call(basic("sixteen-chars-xx", "sixteen-chars-yy"))).status).toBe(200);
    });
  });

  describe("401 on a wrong or missing Authorization header, before reading anything", () => {
    it.each([
      ["no header", undefined],
      ["wrong user", basic("google-ads-feed-usex", PASSWORD)],
      ["wrong password", basic(USER, "a-long-random-feed-passwore")],
      ["password with extra text", basic(USER, `${PASSWORD}x`)],
      ["swapped", basic(PASSWORD, USER)],
      ["no colon", `Basic ${Buffer.from(`${USER}${PASSWORD}`).toString("base64")}`],
      ["malformed base64", "Basic !!!not-base64***"],
      // A lenient decoder skips the junk and finds the right pair inside it.
      ["right pair wrapped in junk", `${basic(USER, PASSWORD)}***`],
      ["right pair with a second token", `${basic(USER, PASSWORD)} extra`],
      ["empty Basic", "Basic "],
      ["another scheme", `Bearer ${PASSWORD}`],
    ])("%s", async (_label, auth) => {
      const response = await call(auth);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Basic realm="pss-ads-feed"');
      expect(await response.text()).toBe("");
      expect(conversionsCsvNow).not.toHaveBeenCalled();
    });
  });

  it("serves the conversions CSV to the right credentials", async () => {
    const response = await call(basic(USER, PASSWORD));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CSV);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(conversionsCsvNow).toHaveBeenCalledTimes(1);
  });

  it("accepts a password containing colons and a lowercase scheme", async () => {
    vi.stubEnv("ADS_FEED_PASSWORD", "pass:word:with-colons");
    const auth = basic(USER, "pass:word:with-colons").replace("Basic", "basic");
    expect((await call(auth)).status).toBe(200);
  });

  it("never logs the credentials or the header", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}));
    await call(basic(USER, PASSWORD));
    await call(basic(USER, "a-long-random-feed-passwore"));
    await call("Basic !!!not-base64***");
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(Buffer.from(`${USER}:${PASSWORD}`).toString("base64"));
    spies.forEach((spy) => spy.mockRestore());
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeAccessToken = vi.fn(async () => "tok");
vi.mock("@/lib/routes/google-auth", () => ({ routeAccessToken: () => routeAccessToken() }));

import { optimizeTours, routePlanningConfigured, RoutePlanningUnavailable } from "@/lib/routes/optimize";

const ENV = ["GOOGLE_CLOUD_PROJECT_ID", "GOOGLE_SERVICE_ACCOUNT_JSON", "ROUTE_OPTIMIZATION_URL", "ROUTE_OPTIMIZATION_TOKEN"];

let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const key of ENV) vi.stubEnv(key, "");
  routeAccessToken.mockReset().mockResolvedValue("tok");
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ routes: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  errorSpy.mockRestore();
});

const google = () => {
  vi.stubEnv("GOOGLE_CLOUD_PROJECT_ID", "pss-proj");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "{}");
};

describe("routePlanningConfigured", () => {
  it("needs both the project id and the service account, or both test overrides", () => {
    expect(routePlanningConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_CLOUD_PROJECT_ID", "pss-proj");
    expect(routePlanningConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_CLOUD_PROJECT_ID", "");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "{}");
    expect(routePlanningConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_CLOUD_PROJECT_ID", "pss-proj");
    expect(routePlanningConfigured()).toBe(true);
    for (const key of ENV) vi.stubEnv(key, "");
    vi.stubEnv("ROUTE_OPTIMIZATION_URL", "http://127.0.0.1:3199/optimize");
    expect(routePlanningConfigured()).toBe(false);
    vi.stubEnv("ROUTE_OPTIMIZATION_TOKEN", "test");
    expect(routePlanningConfigured()).toBe(true);
  });
});

describe("optimizeTours", () => {
  it("posts the body to the project's optimizeTours endpoint with a bearer token", async () => {
    google();
    const result = await optimizeTours({ model: { shipments: [] } });
    expect(result).toEqual({ routes: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://routeoptimization.googleapis.com/v1/projects/pss-proj:optimizeTours");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ authorization: "Bearer tok", "content-type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ model: { shipments: [] } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses the test override URL and token without asking Google for a token", async () => {
    vi.stubEnv("ROUTE_OPTIMIZATION_URL", "http://127.0.0.1:3199/optimize");
    vi.stubEnv("ROUTE_OPTIMIZATION_TOKEN", "test");
    await optimizeTours({});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3199/optimize");
    expect(init.headers.authorization).toBe("Bearer test");
    expect(routeAccessToken).not.toHaveBeenCalled();
  });

  it("rejects with RoutePlanningUnavailable on a non-2xx answer, logging Google's message", async () => {
    google();
    fetchMock.mockResolvedValueOnce(new Response("quota exceeded", { status: 429 }));
    await expect(optimizeTours({})).rejects.toBeInstanceOf(RoutePlanningUnavailable);
    expect(String(errorSpy.mock.calls[0][1])).toContain("quota exceeded");
  });

  it("rejects with RoutePlanningUnavailable when fetch throws (timeout)", async () => {
    google();
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out", "TimeoutError"));
    await expect(optimizeTours({})).rejects.toBeInstanceOf(RoutePlanningUnavailable);
    expect(String(errorSpy.mock.calls[0][1])).toContain("timed out");
  });

  it("rejects with RoutePlanningUnavailable when the token cannot be fetched", async () => {
    google();
    routeAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));
    await expect(optimizeTours({})).rejects.toBeInstanceOf(RoutePlanningUnavailable);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][1])).toContain("invalid_grant");
  });

  it("rejects with RoutePlanningUnavailable when nothing is configured, without calling out", async () => {
    await expect(optimizeTours({})).rejects.toBeInstanceOf(RoutePlanningUnavailable);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});

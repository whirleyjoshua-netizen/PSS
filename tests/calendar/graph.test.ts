import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { calendarConfig, calendarEnabled } = await import("@/lib/calendar/config");
const graph = await import("@/lib/calendar/graph");

const ENV = {
  MS_TENANT_ID: "tenant", MS_CLIENT_ID: "client", MS_CLIENT_SECRET: "secret",
  CALENDAR_MAILBOX: "jobs@example.com", CALENDAR_CLIENT_STATE: "x".repeat(32),
};
const fetchMock = vi.fn();

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  graph.resetGraphTokenForTests();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const token = () => Response.json({ access_token: "tok", expires_in: 3600 });

describe("config", () => {
  it("is enabled only when all five settings are present", () => {
    expect(calendarEnabled()).toBe(true);
    expect(calendarConfig()?.mailbox).toBe("jobs@example.com");
    vi.stubEnv("CALENDAR_CLIENT_STATE", "");
    expect(calendarEnabled()).toBe(false);
    expect(calendarConfig()).toBeNull();
  });
});

describe("graphFetch", () => {
  it("gets a client-credentials token once and sends the Las Vegas time zone", async () => {
    fetchMock.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(Response.json({ ok: 1 }))
      .mockResolvedValueOnce(Response.json({ ok: 2 }));
    await graph.graphFetch("users/jobs@example.com/events");
    await graph.graphFetch("users/jobs@example.com/events");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
    expect(String(tokenInit.body)).toContain("grant_type=client_credentials");
    expect(String(tokenInit.body)).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://graph.microsoft.com/v1.0/users/jobs@example.com/events");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers.Prefer).toBe('outlook.timezone="Pacific Standard Time"');
  });

  it("sends JSON bodies and accepts absolute Graph URLs", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await graph.graphFetch("https://graph.microsoft.com/v1.0/subscriptions/1", { method: "PATCH", body: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://graph.microsoft.com/v1.0/subscriptions/1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("retries once on 429, honoring Retry-After", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(Response.json({}));
    const pending = graph.graphFetch("me");
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(200);
    vi.useRealTimers();
  });

  it("graphJson throws GraphError with the status on failure", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(graph.graphJson("x")).rejects.toMatchObject({ name: "GraphError", status: 404 });
  });

  it("throws when the token request fails, without leaking the secret", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 401 }));
    const error = await graph.graphFetch("x").catch((e) => e);
    expect(error).toBeInstanceOf(graph.GraphError);
    expect(String(error.message)).not.toContain("secret");
  });
});

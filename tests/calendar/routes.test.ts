import { describe, it, expect, vi, beforeEach } from "vitest";

const afterCbs: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCbs.push(cb); } }));
const enabled = vi.fn(() => true);
vi.mock("@/lib/calendar/config", () => ({
  calendarEnabled: () => enabled(), calendarConfig: () => (enabled() ? { clientState: "state-secret" } : null),
}));
const store = { getSyncState: vi.fn(), recordError: vi.fn() };
vi.mock("@/lib/calendar/store", () => store);
const sync = { applyOutlookChange: vi.fn(), reconcileCalendar: vi.fn() };
vi.mock("@/lib/calendar/sync", () => sync);
const ensureSubscription = vi.fn();
vi.mock("@/lib/calendar/subscription", () => ({ ensureSubscription }));

const hook = await import("@/app/api/calendar/notifications/route");
const cron = await import("@/app/api/cron/calendar/route");
const post = (query: string, body?: unknown) =>
  hook.POST(new Request(`http://localhost/api/calendar/notifications${query}`, {
    method: "POST", body: body === undefined ? undefined : JSON.stringify(body),
  }));
const runAfter = async () => { for (const cb of afterCbs.splice(0)) await cb(); };
const note = (over: Record<string, unknown> = {}) => ({
  subscriptionId: "s1", clientState: "state-secret", changeType: "updated", resourceData: { id: "e1" }, ...over,
});

beforeEach(() => {
  afterCbs.length = 0;
  enabled.mockReturnValue(true);
  [store.getSyncState, store.recordError, sync.applyOutlookChange, sync.reconcileCalendar, ensureSubscription].forEach((f) => f.mockReset());
  store.getSyncState.mockResolvedValue({ subscriptionId: "s1" });
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/calendar/notifications", () => {
  it("echoes the validation token as plain text", async () => {
    const res = await post("?validationToken=a%20b%3Cc");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("a b<c");
  });

  it("answers 202 at once and applies the change afterwards", async () => {
    const res = await post("", { value: [note()] });
    expect(res.status).toBe(202);
    expect(sync.applyOutlookChange).not.toHaveBeenCalled();
    await runAfter();
    expect(sync.applyOutlookChange).toHaveBeenCalledWith("e1");
  });

  it("drops notifications with the wrong clientState or subscription", async () => {
    await post("", { value: [note({ clientState: "nope" }), note({ subscriptionId: "other" })] });
    await runAfter();
    expect(sync.applyOutlookChange).not.toHaveBeenCalled();
  });

  it("renews on reauthorizationRequired and reconciles on missed", async () => {
    await post("", { value: [note({ lifecycleEvent: "reauthorizationRequired" }), note({ lifecycleEvent: "missed" })] });
    await runAfter();
    expect(ensureSubscription).toHaveBeenCalledWith(true);
    expect(sync.reconcileCalendar).toHaveBeenCalled();
  });

  it("is 404 when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    expect((await post("?validationToken=x")).status).toBe(404);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await hook.POST(new Request("http://localhost/api/calendar/notifications", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/cron/calendar", () => {
  const get = (auth?: string) => cron.GET(new Request("http://localhost/api/cron/calendar", {
    headers: auth ? { authorization: auth } : {},
  }));

  it("refuses a missing or wrong secret", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer nope")).status).toBe(401);
    expect(ensureSubscription).not.toHaveBeenCalled();
  });

  it("renews the subscription and reconciles", async () => {
    ensureSubscription.mockResolvedValue({ id: "s1", expiresAt: new Date("2026-09-21T00:00:00Z") });
    sync.reconcileCalendar.mockResolvedValue({ jobs: 3, failed: 0 });
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscriptionExpires: "2026-09-21T00:00:00.000Z", jobs: 3, failed: 0 });
  });

  it("fails the run when anything failed", async () => {
    ensureSubscription.mockRejectedValue(new Error("Graph POST failed (403)"));
    sync.reconcileCalendar.mockResolvedValue({ jobs: 0, failed: 0 });
    expect((await get("Bearer s3cret")).status).toBe(500);
    expect(store.recordError).toHaveBeenCalledWith("Graph POST failed (403)");
  });

  it("skips quietly when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "Outlook is not configured" });
  });
});

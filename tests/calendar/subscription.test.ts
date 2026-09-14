import { describe, it, expect, vi, beforeEach } from "vitest";

const store = { getSyncState: vi.fn(), saveSubscription: vi.fn() };
vi.mock("@/lib/calendar/store", () => store);
const graphFetch = vi.fn();
vi.mock("@/lib/calendar/graph", async () => ({
  ...(await vi.importActual<typeof import("@/lib/calendar/graph")>("@/lib/calendar/graph")), graphFetch,
}));
vi.mock("@/lib/calendar/config", () => ({
  calendarConfig: () => ({ mailbox: "jobs@example.com", clientState: "state" }), calendarEnabled: () => true,
}));
vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.example" }));
const { ensureSubscription } = await import("@/lib/calendar/subscription");
const DAY = 86_400_000;

beforeEach(() => { store.getSyncState.mockReset(); store.saveSubscription.mockReset(); graphFetch.mockReset(); });

describe("ensureSubscription", () => {
  it("leaves a subscription with more than 3 days left alone", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + 5 * DAY) });
    await ensureSubscription();
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("renews one that expires within 3 days to just under 7 days", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + DAY) });
    graphFetch.mockResolvedValue(Response.json({ id: "s1", expirationDateTime: "2026-09-21T00:00:00Z" }));
    await ensureSubscription();
    const [path, init] = graphFetch.mock.calls[0];
    expect(path).toBe("subscriptions/s1");
    expect(init.method).toBe("PATCH");
    const ms = new Date(init.body.expirationDateTime).getTime() - Date.now();
    expect(ms).toBeGreaterThan(6.9 * DAY);
    expect(ms).toBeLessThan(7 * DAY);
    expect(store.saveSubscription).toHaveBeenCalledWith("s1", new Date("2026-09-21T00:00:00Z"));
  });

  it("creates a new subscription when the old one is gone", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + DAY) });
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: "s2", expirationDateTime: "2026-09-21T00:00:00Z" }, { status: 201 }));
    await ensureSubscription();
    const [path, init] = graphFetch.mock.calls[1];
    expect(path).toBe("subscriptions");
    expect(init.body).toMatchObject({
      changeType: "created,updated,deleted", resource: "users/jobs@example.com/events", clientState: "state",
      notificationUrl: "https://pss.example/api/calendar/notifications",
      lifecycleNotificationUrl: "https://pss.example/api/calendar/notifications",
    });
    expect(store.saveSubscription).toHaveBeenCalledWith("s2", expect.any(Date));
  });

  it("adopts the existing subscription when creating returns 409", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: null, expiresAt: null });
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ value: [{ id: "s7", resource: "Users/jobs@example.com/Events",
        notificationUrl: "https://pss.example/api/calendar/notifications" }] }))
      .mockResolvedValueOnce(Response.json({ id: "s7", expirationDateTime: "2026-09-21T00:00:00Z" }));
    const result = await ensureSubscription();
    expect(result.id).toBe("s7");
    expect(graphFetch.mock.calls[2][0]).toBe("subscriptions/s7");
  });

  it("forces a renewal when asked", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + 5 * DAY) });
    graphFetch.mockResolvedValue(Response.json({ id: "s1", expirationDateTime: "2026-09-21T00:00:00Z" }));
    await ensureSubscription(true);
    expect(graphFetch).toHaveBeenCalledTimes(1);
  });
});

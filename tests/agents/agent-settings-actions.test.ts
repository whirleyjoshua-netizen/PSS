import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { createAgent: vi.fn(), setAgentKeyHash: vi.fn(), saveAgentSettings: vi.fn(), addSuppression: vi.fn(), removeSuppression: vi.fn() };
vi.mock("@/lib/agents/store", () => store);
const a = await import("@/app/admin/settings/agent-actions");
const { hashKey } = await import("@/lib/agents/rules");
const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d; };
beforeEach(() => { requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" }); for (const fn of Object.values(store)) fn.mockReset(); });

describe("agent settings actions", () => {
  it("creates a key, stores only its hash, and shows it once", async () => {
    store.setAgentKeyHash.mockResolvedValue(true);
    const state = await a.createKeyAction("tara", {}, new FormData());
    expect(state.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.setAgentKeyHash).toHaveBeenCalledWith("tara", hashKey(state.key!));
    expect(store.setAgentKeyHash.mock.calls[0][1]).not.toBe(state.key);
  });
  it("says so when the agent is gone, and returns no key", async () => {
    store.setAgentKeyHash.mockResolvedValue(false);
    const state = await a.createKeyAction("gone", {}, new FormData());
    expect(state.key).toBeUndefined();
    expect(state.error).toMatch(/no longer exists/);
  });
  it("adds an agent with a valid slug and refuses a bad one", async () => {
    store.createAgent.mockResolvedValue(true);
    expect(await a.addAgentAction({}, form({ slug: "scout", name: "Scout", role: "Reviews", dailySendCap: "5" }))).toEqual({ ok: true });
    expect(store.createAgent).toHaveBeenCalledWith({ slug: "scout", name: "Scout", role: "Reviews", statsAccess: false, dailySendCap: 5 });
    expect((await a.addAgentAction({}, form({ slug: "Bad Slug", name: "x", dailySendCap: "5" }))).error).toBeTruthy();
    expect(store.createAgent).toHaveBeenCalledTimes(1);
  });
  it("passes stats access through when ticked", async () => {
    store.createAgent.mockResolvedValue(true);
    await a.addAgentAction({}, form({ slug: "scout", name: "Scout", statsAccess: "on", dailySendCap: "0" }));
    expect(store.createAgent).toHaveBeenCalledWith({ slug: "scout", name: "Scout", role: "", statsAccess: true, dailySendCap: 0 });
  });
  it("refuses a daily cap over 50", async () => {
    expect((await a.addAgentAction({}, form({ slug: "scout", name: "Scout", dailySendCap: "51" }))).error).toBeTruthy();
    expect(store.createAgent).not.toHaveBeenCalled();
  });
  it("says when the slug is taken", async () => {
    store.createAgent.mockResolvedValue(false);
    expect((await a.addAgentAction({}, form({ slug: "tara", name: "Tara", dailySendCap: "10" }))).error).toMatch(/already/);
  });
  it("saves mailing address and signature as the signed-in owner", async () => {
    await a.saveAgentSettingsAction({}, form({ mailingAddress: " PO Box 1 ", signature: "" }));
    expect(store.saveAgentSettings).toHaveBeenCalledWith({ mailingAddress: "PO Box 1", signature: "", by: "owner@example.com" });
  });
  it("saves a whitespace-only mailing address as empty, so sending stays blocked", async () => {
    await a.saveAgentSettingsAction({}, form({ mailingAddress: "   \n ", signature: "  Hi  " }));
    expect(store.saveAgentSettings).toHaveBeenCalledWith({ mailingAddress: "", signature: "Hi", by: "owner@example.com" });
  });
  it("adds a do-not-contact address, normalized, and refuses a bad one", async () => {
    expect(await a.addSuppressionAction({}, form({ address: " Bob@Example.COM " }))).toEqual({ ok: true });
    expect(store.addSuppression).toHaveBeenCalledWith("bob@example.com", "Added by owner", "owner");
    expect((await a.addSuppressionAction({}, form({ address: "not an email" }))).error).toBeTruthy();
    expect(store.addSuppression).toHaveBeenCalledTimes(1);
  });
  it("removes a do-not-contact address", async () => {
    await a.removeSuppressionAction("bob@example.com");
    expect(store.removeSuppression).toHaveBeenCalledWith("bob@example.com");
  });
  it("every action requires an admin", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(a.createKeyAction("tara", {}, new FormData())).rejects.toThrow();
    await expect(a.addAgentAction({}, form({ slug: "scout", name: "Scout", dailySendCap: "5" }))).rejects.toThrow();
    await expect(a.saveAgentSettingsAction({}, form({ mailingAddress: "PO Box 1", signature: "" }))).rejects.toThrow();
    await expect(a.addSuppressionAction({}, form({ address: "bob@example.com" }))).rejects.toThrow();
    await expect(a.removeSuppressionAction("bob@example.com")).rejects.toThrow();
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
  });
});

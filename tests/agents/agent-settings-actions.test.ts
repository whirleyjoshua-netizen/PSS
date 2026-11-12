import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { addSuppression: vi.fn(), removeSuppression: vi.fn() };
vi.mock("@/lib/agents/store", () => store);
const a = await import("@/app/admin/settings/agent-actions");
const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d; };
beforeEach(() => { requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" }); for (const fn of Object.values(store)) fn.mockReset(); });

describe("do-not-contact actions", () => {
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
    await expect(a.addSuppressionAction({}, form({ address: "bob@example.com" }))).rejects.toThrow();
    await expect(a.removeSuppressionAction("bob@example.com")).rejects.toThrow();
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
  });
});

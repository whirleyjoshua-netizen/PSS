import { beforeEach, describe, expect, it, vi } from "vitest";
const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = await import("@/lib/column/store");
const actions = await import("@/app/admin/settings/column-actions");
const { hashKey } = await import("@/lib/agents/rules");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const values = (call: unknown[]) => call.slice(1);

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
});

describe("column store", () => {
  it("matches only Column's own key, and marks it used", async () => {
    sql.mockResolvedValueOnce([{ name: "column" }]);
    expect(await store.columnKeyMatches("ab".repeat(32))).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("update integration_keys set last_used_at = now() where name = 'column' and key_hash = ?");
    expect(await store.columnKeyMatches("cd".repeat(32))).toBe(false);
  });
  it("makes unsubscribe tokens once per address, lowercased and without repeats", async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ address: "pat@example.com", token: "t".repeat(32) }]);
    const map = await store.unsubscribeTokens([" Pat@Example.com", "pat@example.com"]);
    expect(text(sql.mock.calls[0])).toContain("on conflict (address) do nothing");
    const [tokens, addresses] = values(sql.mock.calls[0]) as [string[], string[]];
    expect(addresses).toEqual(["pat@example.com"]);
    expect(tokens[0]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(map.get("pat@example.com")).toBe("t".repeat(32));
  });
  it("asks nothing for an empty list", async () => {
    expect((await store.unsubscribeTokens([])).size).toBe(0);
    expect(sql).not.toHaveBeenCalled();
  });
  it("reads leads after a cursor, joined to the do-not-contact list", async () => {
    await store.listLeadsPage("3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", 10);
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("left join email_suppressions s on s.address = lower(btrim(l.email))");
    expect(q).toContain("order by l.id limit ?");
  });
});

describe("column settings actions", () => {
  it("lets an owner make a key, storing only its hash", async () => {
    const state = await actions.createColumnKeyAction({}, new FormData());
    expect(state.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(values(sql.mock.calls[0])).toContain(hashKey(state.key!));
    expect(values(sql.mock.calls[0])).not.toContain(state.key);
  });
  it("refuses someone who isn't an owner, and changes nothing", async () => {
    requireAdmin.mockResolvedValue({ email: "helper@example.com" });
    expect((await actions.createColumnKeyAction({}, new FormData())).error).toMatch(/Only an owner/);
    expect((await actions.disconnectColumnAction({}, new FormData())).error).toMatch(/Only an owner/);
    expect(sql).not.toHaveBeenCalled();
  });
  it("disconnects by deleting the key", async () => {
    expect((await actions.disconnectColumnAction({}, new FormData())).disconnected).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("delete from integration_keys where name = 'column'");
  });
});

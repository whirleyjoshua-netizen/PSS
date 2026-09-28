import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { isAllowed, isOwner } = await import("@/lib/admin/allowlist");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
});

describe("isOwner", () => {
  it("matches the env list regardless of case or surrounding space", () => {
    expect(isOwner("  Owner@Example.com ")).toBe(true);
    expect(isOwner("someone@example.com")).toBe(false);
    expect(isOwner("owner@example.com", "")).toBe(false);
  });
});

describe("isAllowed", () => {
  it("allows an owner without touching the database", async () => {
    expect(await isAllowed(" OWNER@example.com")).toBe(true);
    expect(sql).not.toHaveBeenCalled();
  });

  it("allows an address given access in Settings, looked up normalized", async () => {
    sql.mockResolvedValue([{ "?column?": 1 }]);
    expect(await isAllowed("  Alia@Example.com ")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("from admin_access");
    expect(sql.mock.calls[0]).toContain("alia@example.com");
  });

  it("refuses an address that is neither", async () => {
    expect(await isAllowed("stranger@example.com")).toBe(false);
  });

  it("refuses a blank address without a lookup", async () => {
    expect(await isAllowed("   ")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("throws when the lookup fails, never allowing", async () => {
    sql.mockRejectedValue(new Error("db down"));
    await expect(isAllowed("stranger@example.com")).rejects.toThrow("db down");
  });
});

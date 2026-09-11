import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const jar = new Map<string, string>();
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  set: vi.fn((name: string, value: string, _options?: Record<string, unknown>) => jar.set(name, value)),
  delete: vi.fn((name: string) => jar.delete(name)),
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));

const { createSession, getAdmin, requireAdmin, destroySession, SESSION_COOKIE } =
  await import("@/lib/admin/session");
const { hashToken } = await import("@/lib/admin/tokens");

beforeEach(() => {
  jar.clear();
  sql.mockReset().mockResolvedValue([]);
  cookieStore.set.mockClear();
  redirect.mockClear();
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
});

describe("sessions", () => {
  it("sets an httpOnly 30-day cookie and stores only its hash", async () => {
    await createSession("owner@example.com");

    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options?.maxAge).toBe(60 * 60 * 24 * 30);
    expect(sql.mock.calls[0]).toContain(hashToken(value));
    expect(sql.mock.calls[0]).not.toContain(value);
  });

  it("finds the owner for a live session", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "owner@example.com" }]);
    expect(await getAdmin()).toEqual({ email: "owner@example.com" });
  });

  it("returns null without a cookie, and never queries", async () => {
    expect(await getAdmin()).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns null for an expired or deleted session", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([]);
    expect(await getAdmin()).toBeNull();
  });

  it("returns null once the address is off the allowlist", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "former@example.com" }]);
    expect(await getAdmin()).toBeNull();
  });

  it("requireAdmin redirects to sign-in when there is no owner", async () => {
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/admin/sign-in");
  });

  it("signing out deletes the row and the cookie", async () => {
    jar.set(SESSION_COOKIE, "tok");
    await destroySession();
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});

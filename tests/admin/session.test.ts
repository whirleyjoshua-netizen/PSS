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

const { createSession, getAdmin, requireAdmin, destroySession, touchSession, SESSION_COOKIE } =
  await import("@/lib/admin/session");
const { hashToken } = await import("@/lib/admin/tokens");

beforeEach(() => {
  jar.clear();
  sql.mockReset().mockResolvedValue([]);
  cookieStore.set.mockClear();
  redirect.mockClear();
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
});

/** Collapses whitespace so assertions match the SQL regardless of line breaks. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}

describe("sessions", () => {
  it("sets an httpOnly 400-day cookie and stores only its hash", async () => {
    await createSession("owner@example.com");

    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options?.maxAge).toBe(34_560_000);
    const insert = sql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join("?").includes("insert into admin_sessions"),
    )!;
    expect(insert).toContain(hashToken(value));
    expect(insert).not.toContain(value);
  });

  it("still writes a 30-day expiry for a new session", async () => {
    await createSession("owner@example.com");

    const insert = sql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join("?").includes("insert into admin_sessions"),
    )!;
    expect((insert[0] as TemplateStringsArray).join("?")).toContain("now() + interval '30 days'");
  });

  it("deletes expired sessions before creating a new one", async () => {
    await createSession("owner@example.com");

    const del = sql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join("?").includes("delete from admin_sessions"),
    )!;
    expect(del).toBeDefined();
    expect((del[0] as TemplateStringsArray).join("?")).toContain("expires_at < now()");
  });

  it("finds the owner for a live session", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "owner@example.com" }]);
    expect(await getAdmin()).toEqual({ email: "owner@example.com" });
  });

  it("looks up and extends the session in one statement", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "owner@example.com" }]);
    await getAdmin();

    const sessionCalls = sql.mock.calls.filter((call) =>
      (call[0] as TemplateStringsArray).join("?").includes("admin_sessions"),
    );
    expect(sessionCalls).toHaveLength(1);
    const [strings, ...params] = sessionCalls[0];
    const text = normalize((strings as TemplateStringsArray).join("?"));
    expect(text).toContain(
      "with s as (select email from admin_sessions where token_hash = ? and expires_at > now())",
    );
    expect(text).toContain("update admin_sessions set expires_at = now() + interval '30 days'");
    expect(text).toContain("expires_at < now() + interval '29 days'");
    expect(params.length).toBeGreaterThan(0);
    for (const param of params) expect(param).toBe(hashToken("tok"));
  });

  it("touchSession returns the session's email, or null", async () => {
    sql.mockResolvedValueOnce([{ email: "owner@example.com" }]);
    expect(await touchSession(hashToken("tok"))).toBe("owner@example.com");
    sql.mockResolvedValueOnce([]);
    expect(await touchSession(hashToken("tok"))).toBeNull();

    const text = normalize((sql.mock.calls[0][0] as TemplateStringsArray).join("?"));
    expect(text).toContain("update admin_sessions set expires_at = now() + interval '30 days'");
    expect(sql.mock.calls[0].slice(1)).toContain(hashToken("tok"));
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
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from admin_access") ? [] : [{ email: "former@example.com" }],
    );
    expect(await getAdmin()).toBeNull();
  });

  it("finds an admin given access in Settings", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from admin_access") ? [{ "?column?": 1 }] : [{ email: "alia@example.com" }],
    );
    expect(await getAdmin()).toEqual({ email: "alia@example.com" });
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

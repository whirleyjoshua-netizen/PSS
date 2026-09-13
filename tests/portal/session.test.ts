import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const visibleJobs = vi.fn();
vi.mock("@/lib/portal/access", () => ({ visibleJobs }));

const jar = new Map<string, string>();
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  set: vi.fn((name: string, value: string) => jar.set(name, value)),
  delete: vi.fn((name: string | Record<string, unknown>) => jar.delete(typeof name === "string" ? name : String(name.name))),
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));

const { CUSTOMER_COOKIE, createCustomerSession, destroyCustomerSession, getCustomer, requireCustomer } =
  await import("@/lib/portal/session");
const { hashToken } = await import("@/lib/admin/tokens");

beforeEach(() => {
  jar.clear();
  sql.mockReset().mockResolvedValue([]);
  visibleJobs.mockReset().mockResolvedValue([{ id: "job" }]);
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  redirect.mockClear();
});

describe("customer sessions", () => {
  it("sets a 30-day httpOnly cookie scoped to /project and stores only its hash", async () => {
    await createCustomerSession("maria@example.com");
    const [name, value, options] = cookieStore.set.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(name).toBe("pss_customer");
    expect(name).toBe(CUSTOMER_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/project", maxAge: 60 * 60 * 24 * 30 });
    const insert = sql.mock.calls.find((c) => (c[0] as TemplateStringsArray).join("?").includes("insert into customer_sessions"))!;
    expect(insert).toContain(hashToken(value));
    expect(insert).not.toContain(value);
  });

  it("returns the customer and their visible jobs for a live session", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    expect(await getCustomer()).toEqual({ email: "maria@example.com", jobs: [{ id: "job" }] });
    expect(visibleJobs).toHaveBeenCalledWith("maria@example.com");
  });

  it("returns null without a cookie, and never queries", async () => {
    expect(await getCustomer()).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns null for an expired or deleted session", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    expect(await getCustomer()).toBeNull();
  });

  it("returns null once no job is visible (for example, marked Lost)", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    visibleJobs.mockResolvedValue([]);
    expect(await getCustomer()).toBeNull();
  });

  it("requireCustomer sends a stranger to the customer sign-in", async () => {
    await expect(requireCustomer()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/project/sign-in");
  });

  it("signing out deletes the row and the cookie", async () => {
    jar.set(CUSTOMER_COOKIE, "tok");
    await destroyCustomerSession();
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
    expect(cookieStore.delete).toHaveBeenCalled();
    expect(jar.has(CUSTOMER_COOKIE)).toBe(false);
  });
});

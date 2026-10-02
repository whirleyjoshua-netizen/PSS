import { afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const FOUR_HUNDRED_DAYS = 60 * 60 * 24 * 400;
const request = (cookie?: string) =>
  new NextRequest("https://pss.test/admin/jobs", { headers: cookie ? { cookie } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("sends a visitor with no session cookie to sign-in, setting nothing", () => {
    const response = proxy(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://pss.test/admin/sign-in");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("re-sets the session cookie on the way through, as createSession sets it, so it keeps sliding", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = proxy(request("pss_admin=abc123; other=x"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    const cookie = response.cookies.get("pss_admin");
    expect(cookie).toMatchObject({
      name: "pss_admin",
      value: "abc123",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: FOUR_HUNDRED_DAYS,
    });
    // Next derives Expires from Max-Age: 400 days from now.
    const expires = new Date(cookie?.expires as Date).getTime();
    expect(Math.abs(expires - (Date.now() + FOUR_HUNDRED_DAYS * 1000))).toBeLessThan(60_000);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain("pss_admin=abc123");
    expect(header).toContain(`Max-Age=${FOUR_HUNDRED_DAYS}`);
    expect(header).not.toContain("other=");
  });

  it("leaves Secure off outside production, as createSession does", () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = proxy(request("pss_admin=abc123"));
    expect(response.cookies.get("pss_admin")?.secure).toBe(false);
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findReferrer = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ findReferrer }));

const { GET } = await import("@/app/(site)/r/[code]/route");
const open = (code: string) =>
  GET(new NextRequest(`https://premiershadesolutions.com/r/${code}`), { params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  findReferrer.mockReset();
});

describe("GET /r/[code]", () => {
  it("remembers the code and sends the friend to the contact form", async () => {
    findReferrer.mockResolvedValue({ id: "x", code: "K7M2QX", firstName: "Sarah" });
    const response = await open("k7m2qx");
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/contact");
    expect(location.searchParams.get("ref")).toBe("friend");
    expect(location.searchParams.get("r")).toBe("K7M2QX");
    expect(location.searchParams.get("by")).toBe("Sarah");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("pss_ref=K7M2QX");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).toContain("Max-Age=2592000");
  });

  it("sends an unknown code to the plain contact form with no cookie", async () => {
    findReferrer.mockResolvedValue(null);
    const response = await open("ZZZZZZ");
    expect(new URL(response.headers.get("location")!).search).toBe("");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("still lands on the contact form when the database is down", async () => {
    findReferrer.mockRejectedValue(new Error("Neon down"));
    const response = await open("K7M2QX");
    expect(new URL(response.headers.get("location")!).pathname).toBe("/contact");
  });
});

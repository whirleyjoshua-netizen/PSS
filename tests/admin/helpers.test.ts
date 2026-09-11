import { describe, it, expect } from "vitest";
import { newToken, hashToken } from "@/lib/admin/tokens";
import { parseAllowlist, isAllowed } from "@/lib/admin/allowlist";
import { dollarsToCents, formatCents } from "@/lib/admin/money";
import { fromLocalInput, toLocalInput } from "@/lib/admin/time";

describe("tokens", () => {
  it("are long, url-safe, and never repeat", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });

  it("hash to a stable 64-character hex digest", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("allowlist", () => {
  it("trims, lowercases, and drops blanks", () => {
    expect(parseAllowlist(" A@x.com, ,b@Y.com ")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });

  it("matches regardless of case or surrounding space", () => {
    expect(isAllowed("  Owner@Example.com ", "owner@example.com")).toBe(true);
    expect(isAllowed("someone@example.com", "owner@example.com")).toBe(false);
    expect(isAllowed("owner@example.com", "")).toBe(false);
  });
});

describe("money", () => {
  it("reads dollars the way people type them", () => {
    expect(dollarsToCents("4500")).toBe(450000);
    expect(dollarsToCents("$4,500.50")).toBe(450050);
    expect(dollarsToCents("  ")).toBeNull();
  });

  it("refuses anything that is not an amount", () => {
    expect(() => dollarsToCents("about 4k")).toThrow(/amount/);
    expect(() => dollarsToCents("-5")).toThrow(/amount/);
  });

  it("formats cents for display", () => {
    expect(formatCents(450000)).toBe("$4,500");
    expect(formatCents(450050)).toBe("$4,500.50");
    expect(formatCents(null)).toBe("—");
  });
});

describe("Las Vegas time", () => {
  it("reads a summer time as Pacific Daylight Time", () => {
    expect(fromLocalInput("2026-07-15T14:30").toISOString()).toBe("2026-07-15T21:30:00.000Z");
  });

  it("reads a winter time as Pacific Standard Time", () => {
    expect(fromLocalInput("2026-12-15T14:30").toISOString()).toBe("2026-12-15T22:30:00.000Z");
  });

  it("round-trips back to the input format", () => {
    expect(toLocalInput(new Date("2026-12-15T22:30:00.000Z"))).toBe("2026-12-15T14:30");
  });
});

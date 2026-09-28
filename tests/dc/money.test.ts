import { describe, expect, it } from "vitest";
import { parseMoney, pctToBasisPoints, sellUnitCents } from "@/lib/dc/money";

describe("parseMoney", () => {
  it.each([
    ["655.00", 65500], ["1,619.00", 161900], ["0.01", 1], ["$2,309.00", 230900],
    ["-10.00", -1000], ["(10.00)", -1000], [" 336.67 ", 33667],
  ])("%s → %i cents", (text, cents) => expect(parseMoney(text)).toBe(cents));

  it.each(["", "abc", "1.5", "1,2,3.00x", "12"])("refuses %j", (text) => expect(parseMoney(text)).toBeNull());

  it("never goes through floating point (0.29 is 29, not 28.999…)", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("1,000,000.07")).toBe(100000007);
  });
});

describe("sellUnitCents", () => {
  it("is MSRP × pct, rounded half up to the cent", () => {
    expect(sellUnitCents(65500, 60)).toBe(39300);
    expect(sellUnitCents(230900, 55.5)).toBe(128150); // 128149.5 rounds up
    expect(sellUnitCents(20501, 100)).toBe(20501);
    expect(sellUnitCents(1, 50)).toBe(1); // 0.5 rounds up
  });
  it("uses basis points, so 57.3 is exactly 5730", () => {
    expect(pctToBasisPoints(57.3)).toBe(5730);
  });
});

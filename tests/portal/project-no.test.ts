import { describe, it, expect } from "vitest";
import { formatProjectNo } from "@/lib/portal/project-no";

describe("formatProjectNo", () => {
  it("formats a number as PSS-#### ", () => {
    expect(formatProjectNo(1048)).toBe("PSS-1048");
  });

  it("pads to at least four digits", () => {
    expect(formatProjectNo(7)).toBe("PSS-0007");
    expect(formatProjectNo(1)).toBe("PSS-0001");
  });

  it("leaves longer numbers alone", () => {
    expect(formatProjectNo(120456)).toBe("PSS-120456");
  });

  it("returns null for null or undefined", () => {
    expect(formatProjectNo(null)).toBeNull();
    expect(formatProjectNo(undefined)).toBeNull();
  });
});

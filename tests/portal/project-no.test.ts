import { describe, it, expect } from "vitest";
import { formatOptionNo, formatProjectNo } from "@/lib/portal/project-no";

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

describe("formatOptionNo", () => {
  it("is the job's own number for option A", () => {
    expect(formatOptionNo(1042, "A")).toBe("PSS-1042");
  });

  it("adds the letter for options B to Z, padded like the project number", () => {
    expect(formatOptionNo(1042, "B")).toBe("PSS-1042-B");
    expect(formatOptionNo(7, "Z")).toBe("PSS-0007-Z");
    expect(formatOptionNo(120456, "C")).toBe("PSS-120456-C");
  });

  it("is null without a project number, or for anything but one capital letter", () => {
    expect(formatOptionNo(null, "B")).toBeNull();
    expect(formatOptionNo(undefined, "A")).toBeNull();
    for (const bad of ["b", "AA", "", "-", "1"]) expect(formatOptionNo(1042, bad)).toBeNull();
  });
});

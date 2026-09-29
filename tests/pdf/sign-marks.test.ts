import { describe, expect, it } from "vitest";
import {
  INITIALS_BOX, INITIALS_GUTTER, hasInitialMarks, initialedSections, parseSignMarks, sectionNumber, type SignMarks,
} from "@/lib/pdf/sign-marks";

const marks: SignMarks = {
  initials: [{ page: 1, x: 502, y: 700, section: "4" }, { page: 2, x: 502, y: 735, section: "5" }],
  signature: { page: 3, x: 154, y: 400 },
};

describe("sectionNumber (spec §2)", () => {
  it.each([["4. Your Right to Cancel", "4"], ["18. Contact Us", "18"], ["  2. Leading spaces", "2"]])("numbers %s", (text, n) => {
    expect(sectionNumber(text)).toBe(n);
  });
  it.each([["Scope"], ["4.Your"], ["4 Your"], ["A. Lettered"], ["Section 4. Late"], ["4."]])("does not number %s", (text) => {
    expect(sectionNumber(text)).toBeNull();
  });
});

describe("geometry", () => {
  it("leaves room in the gutter for the box and a gap", () => {
    expect(INITIALS_GUTTER).toBeGreaterThanOrEqual(INITIALS_BOX.width + 8);
  });
});

describe("parseSignMarks", () => {
  it("accepts what the renderer stores, as an object or as JSON text", () => {
    expect(parseSignMarks(marks)).toEqual(marks);
    expect(parseSignMarks(JSON.stringify(marks))).toEqual(marks);
    expect(parseSignMarks({ initials: [], signature: null })).toEqual({ initials: [], signature: null });
  });
  it("drops unknown keys", () => {
    expect(parseSignMarks({ ...marks, extra: 1, initials: [{ ...marks.initials[0], note: "x" }] }))
      .toEqual({ initials: [marks.initials[0]], signature: marks.signature });
  });
  it.each([
    ["null", null],
    ["a number", 3],
    ["no initials", { signature: null }],
    ["missing signature key", { initials: [] }],
    ["a negative page", { initials: [{ page: -1, x: 1, y: 1, section: "1" }], signature: null }],
    ["a fractional page", { initials: [], signature: { page: 0.5, x: 1, y: 1 } }],
    ["a non-numeric section", { initials: [{ page: 0, x: 1, y: 1, section: "four" }], signature: null }],
    ["an infinite x", { initials: [], signature: { page: 0, x: Infinity, y: 1 } }],
    ["bad JSON", "{"],
  ])("refuses %s", (_label, value) => expect(parseSignMarks(value)).toBeNull());
});

describe("helpers", () => {
  it("lists initialed sections in order, and none for a legacy file", () => {
    expect(initialedSections(marks)).toEqual(["4", "5"]);
    expect(initialedSections(null)).toEqual([]);
  });
  it("says whether initials are needed", () => {
    expect(hasInitialMarks(marks)).toBe(true);
    expect(hasInitialMarks({ initials: [], signature: marks.signature })).toBe(false);
    expect(hasInitialMarks(null)).toBe(false);
    expect(hasInitialMarks(undefined)).toBe(false);
  });
});

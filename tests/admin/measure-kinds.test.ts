import { describe, it, expect } from "vitest";
import {
  isMeasureKind, officialWindows, windowsOfKind, workingSource, workingWindows, type MeasureSet,
} from "@/lib/admin/measure-kinds";

type W = { id: string; kind: "designer" | "official" };
const d1: W = { id: "d1", kind: "designer" };
const d2: W = { id: "d2", kind: "designer" };
const o1: W = { id: "o1", kind: "official" };
const KEPT = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
const set = (windows: W[], kept: MeasureSet<W>["kept"] = null): MeasureSet<W> => ({ windows, kept });

describe("measure kinds", () => {
  it("knows exactly the two kinds", () => {
    expect(isMeasureKind("designer")).toBe(true);
    expect(isMeasureKind("official")).toBe(true);
    for (const v of ["", "Designer", "final", undefined, null, ["official"]]) expect(isMeasureKind(v)).toBe(false);
  });

  it("splits windows by kind, keeping order", () => {
    const s = set([d1, o1, d2]);
    expect(windowsOfKind(s, "designer")).toEqual([d1, d2]);
    expect(windowsOfKind(s, "official")).toEqual([o1]);
  });

  it("the official list is the official windows, or the designer windows when kept", () => {
    expect(officialWindows(set([d1, o1]))).toEqual([o1]);
    expect(officialWindows(set([d1, d2], KEPT))).toEqual([d1, d2]);
    expect(officialWindows(set([d1]))).toEqual([]);
  });

  it("kept wins even if official rows also exist (the accepted race)", () => {
    expect(officialWindows(set([d1, o1], KEPT))).toEqual([d1]);
  });

  it("works from the official list, falling back to the designer list", () => {
    expect(workingWindows(set([d1, o1]))).toEqual([o1]);
    expect(workingWindows(set([d1, d2]))).toEqual([d1, d2]);
    expect(workingWindows(set([d1], KEPT))).toEqual([d1]);
    expect(workingWindows(set([]))).toEqual([]);
  });

  it("names which list is being worked from", () => {
    expect(workingSource(set([d1, o1]))).toBe("official");
    expect(workingSource(set([d1], KEPT))).toBe("official");
    expect(workingSource(set([d1]))).toBe("designer");
    expect(workingSource(set([]))).toBeNull();
  });
});

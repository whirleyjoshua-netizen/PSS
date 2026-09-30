import { describe, it, expect } from "vitest";
import {
  MAX_EIGHTHS, toEighths, splitEighths, formatEighths, EIGHTH_OPTIONS, ROOMS, REQUIREMENTS, requirementLabel,
  windowCount, oneOf,
} from "@/lib/admin/measure-units";

describe("quantity", () => {
  it("counts windows, not saved lines", () => {
    expect(windowCount([{ quantity: 10 }, { quantity: 1 }, { quantity: 2 }])).toBe(13);
    expect(windowCount([])).toBe(0);
  });

  it("says a window is one of several only when it is", () => {
    expect(oneOf(1)).toBe("");
    expect(oneOf(10)).toBe(" (one of 10)");
  });
});

describe("eighths", () => {
  it("stores inches and eighths as one integer", () => {
    expect(toEighths(35, 5)).toBe(285);
    expect(toEighths(36, 0)).toBe(288);
  });

  it("splits back into inches and eighths", () => {
    expect(splitEighths(285)).toEqual({ inches: 35, eighth: 5 });
  });

  it("formats with reduced fraction glyphs", () => {
    expect(formatEighths(285)).toBe("35 ⅝″");
    expect(formatEighths(290)).toBe("36 ¼″");
    expect(formatEighths(288)).toBe("36″");
    expect(formatEighths(4)).toBe("½″");
    expect(formatEighths(null)).toBe("—");
  });

  it("caps at 600 inches", () => {
    expect(MAX_EIGHTHS).toBe(600 * 8);
  });

  it("offers every eighth from 0 to 7", () => {
    expect(EIGHTH_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("rooms and requirements", () => {
  it("lists the quick-pick rooms in order", () => {
    expect(ROOMS).toEqual([
      "Living room", "Family room", "Kitchen", "Dining room", "Primary bedroom",
      "Bedroom", "Bathroom", "Office", "Patio",
    ]);
  });

  it("labels the special requirements", () => {
    expect(REQUIREMENTS.map((r) => r.value)).toEqual(["hard_surface", "high_ladder"]);
    expect(requirementLabel("high_ladder")).toBe("High ladder");
  });
});

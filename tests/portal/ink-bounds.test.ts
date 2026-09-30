import { describe, expect, it } from "vitest";
import { INK_PADDING, inkBounds } from "@/lib/portal/ink-bounds";

/** A transparent RGBA bitmap with ink (alpha 255) at the given pixels. */
function bitmap(width: number, height: number, ink: [number, number][] = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of ink) data[(y * width + x) * 4 + 3] = 255;
  return { data, width, height };
}

describe("inkBounds", () => {
  it("is null for an empty pad, so nothing is posted", () => {
    expect(inkBounds(bitmap(40, 20))).toBeNull();
  });

  it("is the ink's bounding box plus the padding on every side", () => {
    expect(INK_PADDING).toBe(4);
    expect(inkBounds(bitmap(100, 50, [[20, 10], [60, 30], [35, 18]]))).toEqual({ x: 16, y: 6, width: 60 - 20 + 1 + 8, height: 30 - 10 + 1 + 8 });
  });

  it("counts a faint anti-aliased edge as ink, so no part of the stroke is cut", () => {
    const image = bitmap(100, 50, [[50, 25]]);
    image.data[(40 * 100 + 90) * 4 + 3] = 1;
    expect(inkBounds(image)).toEqual({ x: 46, y: 21, width: 90 - 50 + 1 + 8, height: 40 - 25 + 1 + 8 });
  });

  it("ignores colour in a fully transparent pixel", () => {
    const image = bitmap(30, 30, [[10, 10]]);
    image.data.set([26, 26, 26, 0], (25 * 30 + 25) * 4);
    expect(inkBounds(image)).toEqual({ x: 6, y: 6, width: 9, height: 9 });
  });

  it("clamps the padding to the pad, so the crop never reaches outside it", () => {
    expect(inkBounds(bitmap(100, 50, [[0, 0], [99, 49]]))).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(inkBounds(bitmap(100, 50, [[2, 47]]))).toEqual({ x: 0, y: 43, width: 7, height: 7 });
  });
});

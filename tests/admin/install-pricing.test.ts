import { describe, it, expect } from "vitest";
import {
  INSTALLABLE_TREATMENTS, quantityFor, priceQuote,
  type InstallRate, type InstallSettings, type LineInput,
} from "@/lib/admin/install-pricing";

const settings: InstallSettings = {
  minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0,
};
const rate = (over: Partial<InstallRate> = {}): InstallRate =>
  ({ treatment: "roller_shades", basis: "window", rateCents: 2500, ...over });
const line = (over: Partial<LineInput> = {}): LineInput => ({
  treatment: "roller_shades", count: 1, widthEighths: null, heightEighths: null,
  hardSurface: false, highLadder: false, motorized: false, ...over,
});

describe("INSTALLABLE_TREATMENTS", () => {
  it("is the treatment list without the questionnaire's not-sure answer", () => {
    expect(INSTALLABLE_TREATMENTS).toContain("roller_shades");
    expect(INSTALLABLE_TREATMENTS).not.toContain("not_sure");
    expect(INSTALLABLE_TREATMENTS).toHaveLength(7);
  });
});

describe("quantityFor", () => {
  it("counts windows when priced per window, ignoring dimensions", () => {
    expect(quantityFor("window", line({ count: 6, widthEighths: 999 }))).toBe(6);
  });

  it("rounds each window up to a whole foot, then multiplies by the count", () => {
    // 100 eighths = 12.5 inches = 1.04 ft, up to 2 ft per window.
    expect(quantityFor("linear_ft", line({ count: 3, widthEighths: 100 }))).toBe(6);
  });

  it("does not round a width that is already whole feet", () => {
    // 96 eighths = 12 inches = exactly 1 ft.
    expect(quantityFor("linear_ft", line({ count: 1, widthEighths: 96 }))).toBe(1);
  });

  it("rounds each window up to a whole square foot, then multiplies", () => {
    // 30" x 40" = 1200 sq in = 8.33 sq ft, up to 9 per window.
    expect(quantityFor("sq_ft", line({ count: 3, widthEighths: 240, heightEighths: 320 }))).toBe(27);
  });

  it("does not round an area that is already whole square feet", () => {
    // 12" x 12" = 144 sq in = exactly 1 sq ft.
    expect(quantityFor("sq_ft", line({ count: 1, widthEighths: 96, heightEighths: 96 }))).toBe(1);
  });

  it("refuses to price by the foot without the dimensions it needs", () => {
    expect(() => quantityFor("linear_ft", line({ widthEighths: null })))
      .toThrow("Width is needed to price by the foot");
    expect(() => quantityFor("sq_ft", line({ widthEighths: 240, heightEighths: null })))
      .toThrow("Width and height are needed to price by the square foot");
  });

  it("refuses to price by the square foot without a width", () => {
    expect(() => quantityFor("sq_ft", line({ widthEighths: null, heightEighths: 320 })))
      .toThrow("Width and height are needed to price by the square foot");
  });
});

describe("priceQuote", () => {
  it("prices a simple per-window line", () => {
    const priced = priceQuote([line({ count: 4 })], [rate()], settings);
    expect(priced.lines[0].amountCents).toBe(10_000);
    expect(priced.subtotalCents).toBe(10_000);
    expect(priced.totalCents).toBe(10_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("copies the basis and rate onto the priced line", () => {
    const priced = priceQuote([line()], [rate({ rateCents: 3300 })], settings);
    expect(priced.lines[0]).toMatchObject({ basis: "window", rateCents: 3300, quantity: 1 });
  });

  it("adds each flagged surcharge once per window", () => {
    const priced = priceQuote(
      [line({ count: 2, hardSurface: true, motorized: true })],
      [rate()],
      { ...settings, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 },
    );
    // 2 x 2500 labour, plus 2 x (1000 + 1500) surcharges. High ladder is not flagged.
    expect(priced.lines[0].amountCents).toBe(10_000);
  });

  it("sums several lines", () => {
    const priced = priceQuote(
      [line({ count: 2 }), line({ treatment: "shutters", count: 1, widthEighths: 240, heightEighths: 320 })],
      [rate(), rate({ treatment: "shutters", basis: "sq_ft", rateCents: 100 })],
      settings,
    );
    expect(priced.subtotalCents).toBe(5000 + 900);
  });

  it("raises a job under the minimum, and says the minimum applied", () => {
    const priced = priceQuote([line({ count: 2 })], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.subtotalCents).toBe(5000);
    expect(priced.totalCents).toBe(15_000);
    expect(priced.minimumApplied).toBe(true);
  });

  it("leaves a job over the minimum alone", () => {
    const priced = priceQuote([line({ count: 10 })], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.totalCents).toBe(25_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("does not claim the minimum applied when the job lands exactly on it", () => {
    const priced = priceQuote([line({ count: 6 })], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.totalCents).toBe(15_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("prices an empty job as nothing, not as the minimum", () => {
    const priced = priceQuote([], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.subtotalCents).toBe(0);
    expect(priced.totalCents).toBe(0);
    expect(priced.minimumApplied).toBe(false);
  });

  it("treats a zero rate as a real price, not as missing", () => {
    const priced = priceQuote([line({ count: 3 })], [rate({ rateCents: 0 })], settings);
    expect(priced.totalCents).toBe(0);
  });

  it("says which treatment has no rate rather than pricing it at zero", () => {
    expect(() => priceQuote([line({ treatment: "shutters" })], [rate()], settings))
      .toThrow("No installation rate is set for Shutters");
  });

  it("does not charge the minimum for a job whose lines all have a count of zero", () => {
    const priced = priceQuote([line({ count: 0 }), line({ count: 0 })], [rate()], { ...settings, minimumCents: 15_000 });
    expect(priced.totalCents).toBe(0);
    expect(priced.minimumApplied).toBe(false);
  });

  it("refuses to price a line whose amount would overflow the database column", () => {
    expect(() => priceQuote([line({ count: 1000 })], [rate({ rateCents: 2_147_484 })], settings))
      .toThrow("This job is too large to price.");
  });

  it("refuses to price a job whose total would overflow, even when each line fits", () => {
    const big = line({ count: 1000 });
    expect(() => priceQuote([big, big], [rate({ rateCents: 1_500_000 })], settings))
      .toThrow("This job is too large to price.");
  });

  it("adds the high ladder surcharge alone", () => {
    const priced = priceQuote(
      [line({ count: 2, highLadder: true })],
      [rate()],
      { ...settings, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 },
    );
    // 2 x 2500 labour, plus 2 x 5000 high ladder.
    expect(priced.lines[0].amountCents).toBe(15_000);
  });

  it("adds all three surcharges together on one line", () => {
    const priced = priceQuote(
      [line({ count: 3, hardSurface: true, highLadder: true, motorized: true })],
      [rate()],
      { ...settings, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 },
    );
    // 3 x 2500 labour, plus 3 x (1000 + 5000 + 1500).
    expect(priced.lines[0].amountCents).toBe(7500 + 22_500);
  });

  it("ignores a line with a count of zero", () => {
    const priced = priceQuote([line({ count: 0 })], [rate()], settings);
    expect(priced.lines[0].amountCents).toBe(0);
    expect(priced.subtotalCents).toBe(0);
  });
});

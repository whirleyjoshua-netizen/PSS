import { describe, it, expect } from "vitest";
import {
  allocate, clientSummary, freightFor, parseInches, parseMarkup, parseOptionRows, priceQuote,
  type QuoteWindow, type ShutterRates,
} from "@/lib/admin/shutter-pricing";
import { formatEighths } from "@/lib/admin/measure-units";
import { formatCents } from "@/lib/admin/money";

// Made-up rates. The real ones are the owners' dealer costs and must never be in this public repo.
const rates: ShutterRates = {
  lines: [
    { id: "a", supplier: "norman", name: "Alpha", costCentsPerSqft: 1000, minSqft: 8 },
    { id: "b", supplier: "onyx", name: "Beta", costCentsPerSqft: 800, minSqft: 0 },
  ],
  options: [
    { id: "pct10", supplier: "norman", name: "Premium color", kind: "percent", amount: 1000 },
    { id: "pct5", supplier: "norman", name: "Deco frame", kind: "percent", amount: 500 },
    { id: "shape", supplier: "norman", name: "Angle top", kind: "per_window", amount: 20_000 },
    { id: "tilt", supplier: "norman", name: "Hidden tilt", kind: "per_panel", amount: 2000 },
    { id: "dn", supplier: "norman", name: "DayNite", kind: "per_sqft", amount: 400 },
    { id: "sill", supplier: "norman", name: "Sill cap", kind: "per_linear_ft", amount: 1400 },
    { id: "pull", supplier: "norman", name: "Ring pull", kind: "each", amount: 1500 },
    { id: "color", supplier: "norman", name: "Custom color", kind: "per_order", amount: 20_000 },
    { id: "onyxFrench", supplier: "onyx", name: "French door", kind: "per_window", amount: 11_000 },
  ],
  freight: [
    { supplier: "norman", firstCents: 7500, additionalCents: 2500, oversizeWidthEighths: 720, oversizeFirstCents: 8000, oversizeAdditionalCents: 5000, perSqftCents: 0, minSqft: 0 },
    { supplier: "onyx", firstCents: 0, additionalCents: 0, oversizeWidthEighths: 0, oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 100, minSqft: 200 },
  ],
  markupHundredths: 200,
};

const win = (over: Partial<QuoteWindow> = {}): QuoteWindow => ({
  room: "Kitchen", lineId: "a", widthEighths: 36 * 8, heightEighths: 60 * 8, quantity: 1, panels: 2, options: {}, ...over,
});

describe("the base price", () => {
  it("is area × the line's $/sq ft: 36 × 60 is 15 sq ft, so $150 at $10", () => {
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win()], orderOptions: {} });
    expect(q.windows[0].sqft).toBe(15);
    expect(q.productCostCents).toBe(15_000);
  });

  it("bills a small shutter at the line's minimum area", () => {
    // 24 × 24 = 4 sq ft, billed as 8.
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win({ widthEighths: 192, heightEighths: 192 })], orderOptions: {} });
    expect(q.windows[0].billedSqft).toBe(8);
    expect(q.productCostCents).toBe(8000);
  });

  it("handles eighths exactly: 35 5/8 × 59 7/8", () => {
    const q = priceQuote(rates, null, { supplier: "onyx", windows: [win({ lineId: "b", widthEighths: 285, heightEighths: 479 })], orderOptions: {} });
    // 285 × 479 / 9216 = 14.8128… sq ft × 800 = 11,850.26 → 11,850
    expect(q.productCostCents).toBe(11_850);
  });

  it("multiplies by quantity", () => {
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win({ quantity: 3 })], orderOptions: {} });
    expect(q.productCostCents).toBe(45_000);
    expect(q.shutterCount).toBe(3);
  });

  it("refuses a window with no line from this supplier", () => {
    expect(() => priceQuote(rates, null, { supplier: "onyx", windows: [win({ lineId: "a" })], orderOptions: {} }))
      .toThrow("Kitchen: pick a Onyx line");
  });
});

describe("add-ons", () => {
  it("takes each percent off the base, not off each other: 10% + 5% of $150 is $22.50", () => {
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win({ options: { pct10: 1, pct5: 1 } })], orderOptions: {} });
    expect(q.productCostCents).toBe(15_000 + 2250);
  });

  it("charges per window, per panel, per sq ft, per foot and each", () => {
    const options = { shape: 1, tilt: 1, dn: 1, sill: 3, pull: 2 };
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win({ panels: 4, options })], orderOptions: {} });
    // 15000 base + 20000 shape + 4×2000 tilt + 15×400 DayNite + 3×1400 sill + 2×1500 pulls
    expect(q.productCostCents).toBe(15_000 + 20_000 + 8000 + 6000 + 4200 + 3000);
  });

  it("charges per-window add-ons once per shutter when the window repeats", () => {
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win({ quantity: 2, options: { shape: 1 } })], orderOptions: {} });
    expect(q.productCostCents).toBe(2 * (15_000 + 20_000));
  });

  it("adds per-order add-ons once for the whole order", () => {
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win(), win()], orderOptions: { color: 1 } });
    expect(q.orderCostCents).toBe(20_000);
    expect(q.productCostCents).toBe(30_000 + 20_000);
  });

  it("ignores another supplier's add-on and unticked ones", () => {
    const q = priceQuote(rates, null, { supplier: "norman", windows: [win({ options: { onyxFrench: 1, shape: 0 } })], orderOptions: {} });
    expect(q.productCostCents).toBe(15_000);
  });
});

describe("freight", () => {
  const norman = rates.freight[0];
  const onyx = rates.freight[1];

  it("charges first plus each additional shutter", () => {
    expect(freightFor(norman, [{ widthEighths: 288, quantity: 3, sqft: 15 }])).toBe(7500 + 2 * 2500);
  });

  it("adds the oversize charge for shutters at or over the width", () => {
    const windows = [{ widthEighths: 720, quantity: 2, sqft: 40 }, { widthEighths: 288, quantity: 1, sqft: 15 }];
    expect(freightFor(norman, windows)).toBe(7500 + 2 * 2500 + 8000 + 5000);
  });

  it("charges per sq ft with the minimum billable area", () => {
    expect(freightFor(onyx, [{ widthEighths: 288, quantity: 2, sqft: 15 }])).toBe(200 * 100);
    expect(freightFor(onyx, [{ widthEighths: 288, quantity: 20, sqft: 15 }])).toBe(300 * 100);
  });

  it("is zero with no shutters", () => {
    expect(freightFor(norman, [])).toBe(0);
  });
});

describe("the client price", () => {
  const install = { basis: "sq_ft" as const, rateCents: 600 };

  it("is (product + freight) × markup, plus install that is never marked up", () => {
    const q = priceQuote(rates, install, { supplier: "norman", windows: [win()], orderOptions: {} });
    expect(q.freightCents).toBe(7500);
    expect(q.installCents).toBe(15 * 600);
    expect(q.priceCents).toBe((15_000 + 7500) * 2 + 9000);
    expect(q.marginCents).toBe(q.priceCents! - 22_500 - 9000);
  });

  it("rounds install area up per shutter like the rest of PSS: 15.03 sq ft installs as 16", () => {
    const q = priceQuote(rates, install, { supplier: "norman", windows: [win({ widthEighths: 289 })], orderOptions: {} });
    expect(q.installCents).toBe(16 * 600);
  });

  it("charges install per window when that is how the rate is set", () => {
    const q = priceQuote(rates, { basis: "window", rateCents: 5000 }, { supplier: "norman", windows: [win({ quantity: 2 })], orderOptions: {} });
    expect(q.installCents).toBe(10_000);
  });

  it("window prices add up exactly to the total, freight and per-order costs included", () => {
    const windows = [win(), win({ room: "Den", widthEighths: 301, heightEighths: 397 }), win({ room: "Bath", quantity: 3 })];
    const q = priceQuote(rates, install, { supplier: "norman", windows, orderOptions: { color: 1 } });
    expect(q.windows.reduce((s, w) => s + w.priceCents!, 0)).toBe(q.priceCents);
    expect(q.windows.reduce((s, w) => s + w.freightCents, 0)).toBe(q.freightCents);
  });

  it("has no price or margin until a markup is set, but still shows cost", () => {
    const q = priceQuote({ ...rates, markupHundredths: null }, install, { supplier: "norman", windows: [win()], orderOptions: {} });
    expect(q.priceCents).toBeNull();
    expect(q.marginCents).toBeNull();
    expect(q.windows[0].priceCents).toBeNull();
    expect(q.supplierCostCents).toBe(22_500);
  });
});

describe("allocate", () => {
  it("splits by weight and always adds back to the total", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([33, 33, 34]);
    expect(allocate(1000, [3, 1])).toEqual([750, 250]);
    expect(allocate(50, [0, 0])).toEqual([0, 50]);
    expect(allocate(50, [])).toEqual([]);
  });
});

describe("the client summary", () => {
  it("lists each window's price and the total, and never a cost", () => {
    const q = priceQuote(rates, { basis: "sq_ft", rateCents: 600 }, { supplier: "norman", windows: [win(), win({ room: "Den", quantity: 2 })], orderOptions: {} });
    const text = clientSummary(q, formatEighths, formatCents);
    expect(text).toContain("Kitchen: Alpha shutters, 36″ × 60″:");
    expect(text).toContain("Den (2): Alpha shutters");
    expect(text).toContain(`Total: ${formatCents(q.priceCents!)}`);
    expect(text).toContain("Includes installation and shipping.");
    expect(text).not.toMatch(/cost|margin|freight/i);
  });

  it("is empty without a markup, so cost is never copied out as a price", () => {
    const q = priceQuote({ ...rates, markupHundredths: null }, null, { supplier: "norman", windows: [win()], orderOptions: {} });
    expect(clientSummary(q, formatEighths, formatCents)).toBe("");
  });
});

describe("parseInches", () => {
  it("reads whole, fractional, mixed and decimal sizes as eighths", () => {
    expect(parseInches("36")).toBe(288);
    expect(parseInches("35 5/8")).toBe(285);
    expect(parseInches("35-5/8")).toBe(285);
    expect(parseInches('35 5/8"')).toBe(285);
    expect(parseInches("35.625")).toBe(285);
    expect(parseInches("5/8")).toBe(5);
    expect(parseInches("35 3/16")).toBe(282); // 281.5 eighths rounds up to 35 1/4
  });

  it("is null for blank, zero or not a size", () => {
    expect(parseInches("")).toBeNull();
    expect(parseInches("0")).toBeNull();
    expect(parseInches("abc")).toBeNull();
    expect(parseInches("3/0")).toBeNull();
  });
});

describe("parseMarkup", () => {
  it("reads a multiple", () => {
    expect(parseMarkup("1.9")).toBe(190);
    expect(parseMarkup("2")).toBe(200);
    expect(parseMarkup(" 1.85x ")).toBe(185);
    expect(parseMarkup("")).toBeNull();
  });

  it("refuses a markup that would sell under cost, or nonsense", () => {
    expect(() => parseMarkup("0.9")).toThrow("between 1 and 10");
    expect(() => parseMarkup("abc")).toThrow("like 1.9");
  });
});

describe("parseOptionRows", () => {
  it("reads name | kind | amount rows, with percents in basis points and dollars in cents", () => {
    const { rows, errors } = parseOptionRows(
      "Premium color | % | 10\nAngle top | window | $215.00\nSill cap\tft\t14\nCafe | panel | 30%\n\n",
      "norman",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { supplier: "norman", name: "Premium color", kind: "percent", amount: 1000 },
      { supplier: "norman", name: "Angle top", kind: "per_window", amount: 21_500 },
      { supplier: "norman", name: "Sill cap", kind: "per_linear_ft", amount: 1400 },
      { supplier: "norman", name: "Cafe", kind: "percent", amount: 3000 },
    ]);
  });

  it("names each bad row instead of guessing", () => {
    const { rows, errors } = parseOptionRows("Just a name\nThing | weekly | 5\nOther | each | lots", "onyx");
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      "Row 1: needs name | kind | amount",
      'Row 2: "weekly" is not a kind',
      'Row 3: "lots" is not an amount',
    ]);
  });
});

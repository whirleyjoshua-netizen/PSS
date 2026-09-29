import { describe, it, expect } from "vitest";
import {
  INSTALLABLE_TREATMENTS, quantityFor, priceQuote, priceFingerprint, motorCount, extraLabel, NO_EXTRAS,
  type ExtrasInput, type InstallRate, type InstallSettings, type LineInput,
} from "@/lib/admin/install-pricing";

const settings: InstallSettings = {
  minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0,
  takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0,
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
    const priced = priceQuote([line({ count: 4 })], [rate()], settings, NO_EXTRAS, false);
    expect(priced.lines[0].amountCents).toBe(10_000);
    expect(priced.subtotalCents).toBe(10_000);
    expect(priced.totalCents).toBe(10_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("copies the basis and rate onto the priced line", () => {
    const priced = priceQuote([line()], [rate({ rateCents: 3300 })], settings, NO_EXTRAS, false);
    expect(priced.lines[0]).toMatchObject({ basis: "window", rateCents: 3300, quantity: 1 });
  });

  it("adds each flagged surcharge once per window", () => {
    const priced = priceQuote(
      [line({ count: 2, hardSurface: true, motorized: true })],
      [rate()],
      { ...settings, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, appSetupSmallCents: 6975 },
      NO_EXTRAS,
      false,
    );
    // 2 x 2500 labour, plus 2 x (1000 + 1500) surcharges. High ladder is not flagged.
    expect(priced.lines[0].amountCents).toBe(10_000);
  });

  it("sums several lines", () => {
    const priced = priceQuote(
      [line({ count: 2 }), line({ treatment: "shutters", count: 1, widthEighths: 240, heightEighths: 320 })],
      [rate(), rate({ treatment: "shutters", basis: "sq_ft", rateCents: 100 })],
      settings,
      NO_EXTRAS,
      false,
    );
    expect(priced.subtotalCents).toBe(5000 + 900);
  });

  it("raises a job under the minimum, and says the minimum applied", () => {
    const priced = priceQuote([line({ count: 2 })], [rate()], { ...settings, minimumCents: 15_000 }, NO_EXTRAS, false);
    expect(priced.subtotalCents).toBe(5000);
    expect(priced.totalCents).toBe(15_000);
    expect(priced.minimumApplied).toBe(true);
  });

  it("leaves a job over the minimum alone", () => {
    const priced = priceQuote([line({ count: 10 })], [rate()], { ...settings, minimumCents: 15_000 }, NO_EXTRAS, false);
    expect(priced.totalCents).toBe(25_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("does not claim the minimum applied when the job lands exactly on it", () => {
    const priced = priceQuote([line({ count: 6 })], [rate()], { ...settings, minimumCents: 15_000 }, NO_EXTRAS, false);
    expect(priced.totalCents).toBe(15_000);
    expect(priced.minimumApplied).toBe(false);
  });

  it("prices an empty job as nothing, not as the minimum", () => {
    const priced = priceQuote([], [rate()], { ...settings, minimumCents: 15_000 }, NO_EXTRAS, false);
    expect(priced.subtotalCents).toBe(0);
    expect(priced.totalCents).toBe(0);
    expect(priced.minimumApplied).toBe(false);
  });

  it("treats a zero rate as a real price, not as missing", () => {
    const priced = priceQuote([line({ count: 3 })], [rate({ rateCents: 0 })], settings, NO_EXTRAS, false);
    expect(priced.totalCents).toBe(0);
  });

  it("says which treatment has no rate rather than pricing it at zero", () => {
    expect(() => priceQuote([line({ treatment: "shutters" })], [rate()], settings, NO_EXTRAS, false))
      .toThrow("No installation rate is set for Shutters");
  });

  it("does not charge the minimum for a job whose lines all have a count of zero", () => {
    const priced = priceQuote([line({ count: 0 }), line({ count: 0 })], [rate()], { ...settings, minimumCents: 15_000 }, NO_EXTRAS, false);
    expect(priced.totalCents).toBe(0);
    expect(priced.minimumApplied).toBe(false);
  });

  it("refuses to price a line whose amount would overflow the database column", () => {
    expect(() => priceQuote([line({ count: 1000 })], [rate({ rateCents: 2_147_484 })], settings, NO_EXTRAS, false))
      .toThrow("This job is too large to price.");
  });

  it("refuses to price a job whose total would overflow, even when each line fits", () => {
    const big = line({ count: 1000 });
    expect(() => priceQuote([big, big], [rate({ rateCents: 1_500_000 })], settings, NO_EXTRAS, false))
      .toThrow("This job is too large to price.");
  });

  it("adds the high ladder surcharge alone", () => {
    const priced = priceQuote(
      [line({ count: 2, highLadder: true })],
      [rate()],
      { ...settings, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 },
      NO_EXTRAS,
      false,
    );
    // 2 x 2500 labour, plus 2 x 5000 high ladder.
    expect(priced.lines[0].amountCents).toBe(15_000);
  });

  it("adds all three surcharges together on one line", () => {
    const priced = priceQuote(
      [line({ count: 3, hardSurface: true, highLadder: true, motorized: true })],
      [rate()],
      { ...settings, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, appSetupSmallCents: 6975 },
      NO_EXTRAS,
      false,
    );
    // 3 x 2500 labour, plus 3 x (1000 + 5000 + 1500).
    expect(priced.lines[0].amountCents).toBe(7500 + 22_500);
  });

  it("ignores a line with a count of zero", () => {
    const priced = priceQuote([line({ count: 0 })], [rate()], settings, NO_EXTRAS, false);
    expect(priced.lines[0].amountCents).toBe(0);
    expect(priced.subtotalCents).toBe(0);
  });
});

describe("priceFingerprint", () => {
  const roller = rate({ treatment: "roller_shades", rateCents: 2500 });
  const shutters = rate({ treatment: "shutters", basis: "window", rateCents: 1000 });
  const both = [line({ treatment: "roller_shades" }), line({ treatment: "shutters" })];

  it("is the same for the same lines, rates and minimum", () => {
    const a = priceFingerprint(priceQuote(both, [roller, shutters], settings, NO_EXTRAS, false), 0);
    const b = priceFingerprint(priceQuote(both, [roller, shutters], settings, NO_EXTRAS, false), 0);
    expect(a).toBe(b);
  });

  it("differs when rates move between lines even though the total is unchanged", () => {
    const before = priceQuote(both, [roller, shutters], settings, NO_EXTRAS, false);
    const swapped = priceQuote(both, [{ ...roller, rateCents: 1000 }, { ...shutters, rateCents: 2500 }], settings, NO_EXTRAS, false);
    // Same $35 total, but each saved line would record a different rate and amount.
    expect(swapped.totalCents).toBe(before.totalCents);
    expect(priceFingerprint(swapped, 0)).not.toBe(priceFingerprint(before, 0));
  });

  it("differs when the lines come to a different subtotal that the minimum hides", () => {
    const withMinimum = { ...settings, minimumCents: 15_000 };
    const before = priceQuote([line({ count: 2 })], [roller], withMinimum, NO_EXTRAS, false);
    const raised = priceQuote([line({ count: 2 })], [{ ...roller, rateCents: 3000 }], withMinimum, NO_EXTRAS, false);
    // Both total $150, but "lines came to $50" would become "lines came to $60".
    expect(raised.totalCents).toBe(before.totalCents);
    expect(priceFingerprint(raised, 15_000)).not.toBe(priceFingerprint(before, 15_000));
  });

  it("differs when only the minimum changes, since the saved price records it", () => {
    const priced = priceQuote([line({ count: 10 })], [roller], settings, NO_EXTRAS, false);
    expect(priceFingerprint(priced, 15_000)).not.toBe(priceFingerprint(priced, 20_000));
  });

  it("differs when a surcharge flag changes the saved line", () => {
    const plain = priceQuote([line()], [roller], { ...settings, highLadderCents: 0 }, NO_EXTRAS, false);
    const flagged = priceQuote([line({ highLadder: true })], [roller], { ...settings, highLadderCents: 0 }, NO_EXTRAS, false);
    // A $0 surcharge leaves every amount equal, but the saved line records the flag.
    expect(flagged.totalCents).toBe(plain.totalCents);
    expect(priceFingerprint(flagged, 0)).not.toBe(priceFingerprint(plain, 0));
  });
});

describe("measurement fee", () => {
  const roller = rate({ treatment: "roller_shades", rateCents: 2500 });
  const withFee = { ...settings, minimumCents: 15_000, measureCents: 7500 };

  it("adds nothing when the job is not charged for measuring", () => {
    const priced = priceQuote([line({ count: 10 })], [roller], withFee, NO_EXTRAS, false);
    expect(priced.measureCents).toBe(0);
    expect(priced.totalCents).toBe(25_000);
  });

  it("adds the flat fee when charged, however many windows there are", () => {
    const few = priceQuote([line({ count: 10 })], [roller], withFee, NO_EXTRAS, true);
    const many = priceQuote([line({ count: 40 })], [roller], withFee, NO_EXTRAS, true);
    expect(few.measureCents).toBe(7500);
    expect(many.measureCents).toBe(7500);
    expect(few.totalCents).toBe(25_000 + 7500);
    expect(many.totalCents).toBe(100_000 + 7500);
  });

  it("adds the fee on top of the minimum, not toward it", () => {
    // $50 of work rises to the $150 minimum, then the $75 measure: $225, not $150.
    const priced = priceQuote([line({ count: 2 })], [roller], withFee, NO_EXTRAS, true);
    expect(priced.subtotalCents).toBe(5000);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.totalCents).toBe(15_000 + 7500);
  });

  it("charges only the fee for a measuring visit with no lines at all", () => {
    const priced = priceQuote([], [roller], withFee, NO_EXTRAS, true);
    expect(priced.minimumApplied).toBe(false);
    expect(priced.totalCents).toBe(7500);
  });

  it("charges only the fee for a measuring visit with no windows to install", () => {
    const priced = priceQuote([line({ count: 0 })], [roller], withFee, NO_EXTRAS, true);
    expect(priced.minimumApplied).toBe(false);
    expect(priced.totalCents).toBe(7500);
  });

  it("refuses a total too large to store once the fee is added", () => {
    const huge = { ...withFee, minimumCents: 0, measureCents: 2_147_483_000 };
    expect(() => priceQuote([line({ count: 1 })], [roller], huge, NO_EXTRAS, true)).toThrow("This job is too large to price.");
  });

  it("fingerprints differently when the fee is charged or not", () => {
    const off = priceQuote([line({ count: 10 })], [roller], withFee, NO_EXTRAS, false);
    const on = priceQuote([line({ count: 10 })], [roller], withFee, NO_EXTRAS, true);
    expect(priceFingerprint(on, 15_000)).not.toBe(priceFingerprint(off, 15_000));
  });

  it("fingerprints differently when the fee amount changes", () => {
    const a = priceQuote([line({ count: 10 })], [roller], withFee, NO_EXTRAS, true);
    const b = priceQuote([line({ count: 10 })], [roller], { ...withFee, measureCents: 9000 }, NO_EXTRAS, true);
    expect(priceFingerprint(a, 15_000)).not.toBe(priceFingerprint(b, 15_000));
  });
});

const extrasSettings: InstallSettings = {
  ...settings, takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113,
};
const extras = (over: Partial<ExtrasInput> = {}): ExtrasInput => ({ ...NO_EXTRAS, ...over });
const motorized = (count: number) => line({ count, motorized: true });

describe("motorCount", () => {
  it("adds the window counts of motorized lines only", () => {
    expect(motorCount([motorized(2), line({ count: 5 }), motorized(3)])).toBe(5);
    expect(motorCount([])).toBe(0);
  });
});

describe("priceQuote extras", () => {
  it("charges no extras when none are asked for and nothing is motorized", () => {
    const priced = priceQuote([line({ count: 2 })], [rate()], extrasSettings, NO_EXTRAS, false);
    expect(priced.extras).toEqual([]);
    expect(priced.extrasCents).toBe(0);
  });

  it("charges takedown per window and shutter takedown per square foot", () => {
    const priced = priceQuote([], [rate()], extrasSettings, extras({ takedownWindows: 3, shutterTakedownSqFt: 10 }), false);
    expect(priced.extras).toEqual([
      { kind: "takedown", quantity: 3, rateCents: 1860, amountCents: 5580 },
      { kind: "shutter_takedown", quantity: 10, rateCents: 233, amountCents: 2330 },
    ]);
    expect(priced.extrasCents).toBe(7910);
  });

  it.each([
    [1, "app_setup_small", 6975], [3, "app_setup_small", 6975],
    [4, "app_setup_large", 15_113], [9, "app_setup_large", 15_113],
  ] as const)("prices app set-up for %i motors as %s", (motors, kind, cents) => {
    const priced = priceQuote([motorized(motors)], [rate()], extrasSettings, NO_EXTRAS, false);
    expect(priced.extras).toEqual([{ kind, quantity: motors, rateCents: cents, amountCents: cents }]);
  });

  it("refuses 10 or more motors without a typed set-up price", () => {
    expect(() => priceQuote([motorized(10)], [rate()], extrasSettings, NO_EXTRAS, false))
      .toThrow("10 or more motors: enter the app set-up price");
  });

  it("charges the typed set-up price at 10 or more motors", () => {
    const priced = priceQuote([motorized(6), motorized(6)], [rate()], extrasSettings, extras({ customSetupCents: 25_000 }), false);
    expect(priced.extras).toEqual([{ kind: "app_setup_custom", quantity: 12, rateCents: 25_000, amountCents: 25_000 }]);
  });

  it("ignores a typed set-up price below 10 motors", () => {
    const priced = priceQuote([motorized(2)], [rate()], extrasSettings, extras({ customSetupCents: 25_000 }), false);
    expect(priced.extras).toEqual([{ kind: "app_setup_small", quantity: 2, rateCents: 6975, amountCents: 6975 }]);
  });

  it.each([
    [{ takedownCents: 0 }, extras({ takedownWindows: 1 }), [], "No rate is set for blinds/drapery takedown"],
    [{ shutterTakedownCents: 0 }, extras({ shutterTakedownSqFt: 1 }), [], "No rate is set for shutter takedown"],
    [{ appSetupSmallCents: 0 }, NO_EXTRAS, [motorized(1)], "No rate is set for app set-up, 1–3 motors"],
    [{ appSetupLargeCents: 0 }, NO_EXTRAS, [motorized(4)], "No rate is set for app set-up, 4–9 motors"],
  ] as const)("refuses an extra whose rate is not set (%o)", (unset, input, lines, message) => {
    expect(() => priceQuote([...lines], [rate()], { ...extrasSettings, ...unset }, input, false)).toThrow(message);
  });

  it("does not need a rate for an extra that is not used", () => {
    const unset = { ...extrasSettings, takedownCents: 0, shutterTakedownCents: 0, appSetupSmallCents: 0, appSetupLargeCents: 0 };
    expect(() => priceQuote([line({ count: 2 })], [rate()], unset, NO_EXTRAS, false)).not.toThrow();
  });

  it("counts extras toward the minimum", () => {
    const withMinimum = { ...extrasSettings, minimumCents: 20_925 };
    // 3 x $25 = $75 of lines + $55.80 takedown = $130.80, raised to $209.25.
    const priced = priceQuote([line({ count: 3 })], [rate()], withMinimum, extras({ takedownWindows: 3 }), false);
    expect(priced.subtotalCents).toBe(7500);
    expect(priced.extrasCents).toBe(5580);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.totalCents).toBe(20_925);
  });

  it("does not apply the minimum when lines and extras together reach it", () => {
    const withMinimum = { ...extrasSettings, minimumCents: 10_000 };
    // $75 of lines alone is under $100; with $55.80 takedown it is $130.80.
    const priced = priceQuote([line({ count: 3 })], [rate()], withMinimum, extras({ takedownWindows: 3 }), false);
    expect(priced.minimumApplied).toBe(false);
    expect(priced.totalCents).toBe(13_080);
  });

  it("applies the minimum to a takedown-only job, and puts measuring on top", () => {
    const withMinimum = { ...extrasSettings, minimumCents: 20_925, measureCents: 7500 };
    const priced = priceQuote([], [rate()], withMinimum, extras({ takedownWindows: 2 }), true);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.totalCents).toBe(20_925 + 7500);
  });

  it("refuses extras too large to store", () => {
    const huge = { ...extrasSettings, takedownCents: 2_000_000_000 };
    expect(() => priceQuote([], [rate()], huge, extras({ takedownWindows: 2 }), false)).toThrow("This job is too large to price.");
    const pair = { ...extrasSettings, takedownCents: 1_100_000_000, shutterTakedownCents: 1_100_000_000 };
    expect(() => priceQuote([], [rate()], pair, extras({ takedownWindows: 1, shutterTakedownSqFt: 1 }), false))
      .toThrow("This job is too large to price.");
  });

  it("changes the fingerprint when any extra changes", () => {
    const base = priceQuote([motorized(2)], [rate()], extrasSettings, extras({ takedownWindows: 1 }), false);
    const print = (p: typeof base) => priceFingerprint(p, 0);
    const moreTakedown = priceQuote([motorized(2)], [rate()], extrasSettings, extras({ takedownWindows: 2 }), false);
    const newRate = priceQuote([motorized(2)], [rate()], { ...extrasSettings, takedownCents: 1900 }, extras({ takedownWindows: 1 }), false);
    const newSetup = priceQuote([motorized(2)], [rate()], { ...extrasSettings, appSetupSmallCents: 7000 }, extras({ takedownWindows: 1 }), false);
    expect(print(moreTakedown)).not.toBe(print(base));
    expect(print(newRate)).not.toBe(print(base));
    expect(print(newSetup)).not.toBe(print(base));
  });

  it("changes the fingerprint when the extras differ but their total does not", () => {
    // 2 windows at $10 and 1 window at $20 are both $20 of takedown; only the rows tell them apart.
    const two = priceQuote([], [rate()], { ...extrasSettings, takedownCents: 1000 }, extras({ takedownWindows: 2 }), false);
    const one = priceQuote([], [rate()], { ...extrasSettings, takedownCents: 2000 }, extras({ takedownWindows: 1 }), false);
    expect(two.extrasCents).toBe(one.extrasCents);
    expect(two.totalCents).toBe(one.totalCents);
    expect(priceFingerprint(two, 0)).not.toBe(priceFingerprint(one, 0));
  });
});

describe("extraLabel", () => {
  it("names each kind with its quantity", () => {
    expect(extraLabel({ kind: "takedown", quantity: 3 })).toBe("Takedown, 3 windows");
    expect(extraLabel({ kind: "takedown", quantity: 1 })).toBe("Takedown, 1 window");
    expect(extraLabel({ kind: "shutter_takedown", quantity: 24 })).toBe("Shutter takedown, 24 sq ft");
    expect(extraLabel({ kind: "app_setup_large", quantity: 5 })).toBe("App set-up, 5 motors");
    expect(extraLabel({ kind: "app_setup_small", quantity: 1 })).toBe("App set-up, 1 motor");
  });
});

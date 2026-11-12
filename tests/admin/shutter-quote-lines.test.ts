import { describe, it, expect } from "vitest";
import { priceQuote, type QuoteWindow, type ShutterRates } from "@/lib/admin/shutter-pricing";
import { buildShutterQuote, costSheetHtml, plainInches } from "@/lib/admin/shutter-quote-lines";
import { priceVersion } from "@/lib/dc/pricing";
import { formatCents } from "@/lib/admin/money";

// Made-up rates: the real dealer costs never go in this public repo.
const rates: ShutterRates = {
  lines: [
    { id: "a", supplier: "norman", name: "Alpha", costCentsPerSqft: 1000, minSqft: 8, clientCentsPerSqft: 2500 },
    { id: "b", supplier: "norman", name: "Beta", costCentsPerSqft: 1200, minSqft: 8, clientCentsPerSqft: null },
  ],
  options: [
    { id: "shape", supplier: "norman", name: "Angle top", kind: "per_window", amount: 20_000 },
    { id: "color", supplier: "norman", name: "Custom color", kind: "per_order", amount: 20_000 },
  ],
  freight: [
    { supplier: "norman", firstCents: 7500, additionalCents: 2500, oversizeWidthEighths: 0, oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 0, minSqft: 0 },
    { supplier: "onyx", firstCents: 0, additionalCents: 0, oversizeWidthEighths: 0, oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 0, minSqft: 0 },
  ],
  markupHundredths: 190,
  installCentsPerSqft: 600,
};
const install = { basis: "sq_ft" as const, rateCents: 600 };
const win = (over: Partial<QuoteWindow> = {}): QuoteWindow => ({
  room: "Kitchen", lineId: "a", widthEighths: 36 * 8, heightEighths: 60 * 8, quantity: 1, panels: 2, options: {}, ...over,
});
const price = (windows: QuoteWindow[], orderOptions: Record<string, number> = {}) =>
  priceQuote(rates, install, { supplier: "norman", windows, orderOptions });

/** The official quote's own pricing, as Send and the contract run it on the saved lines. */
const official = (built: ReturnType<typeof buildShutterQuote>) => priceVersion({
  lines: built.lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection, msrpUnitCents: l.msrpUnitCents, costExtendedCents: l.costExtendedCents, pctOverride: 100 })),
  rules: {}, handlingFeeCents: 0, oversizedFeeCents: 0, dealerTotalCents: built.dealerTotalCents,
  waiveHandling: false, install: null, noInstall: true,
});

describe("buildShutterQuote", () => {
  it("makes one line per window at the guide's price, with the size a Dealer Copy would print", () => {
    const q = price([win({ room: " Kitchen ", widthEighths: 36 * 8 + 5 })]);
    const built = buildShutterQuote(q, "norman", rates.options);
    expect(built.lines).toHaveLength(1);
    expect(built.lines[0]).toMatchObject({ position: 1, qty: 1, room: "Kitchen", description: "Norman Alpha shutters", collection: "Norman Alpha", msrpUnitCents: q.windows[0].priceCents });
    expect(built.lines[0].options).toEqual([["Order Width", "36 5/8"], ["Order Height", "60"], ["Panels", "2"]]);
  });

  it("charges exactly the guide's total once the official quote prices it", () => {
    const q = price([win({ options: { shape: 1 } }), win({ room: "Den", quantity: 2 }), win({ room: "Bath", lineId: "b", widthEighths: 24 * 8, heightEighths: 30 * 8 })], { color: 1 });
    const built = buildShutterQuote(q, "norman", rates.options);
    const priced = official(built);
    expect(priced.blockers).toEqual([]);
    expect(priced.clientTotalCents).toBe(q.priceCents);
    expect(built.clientTotalCents).toBe(q.priceCents);
  });

  it("keeps the supplier's whole bill in the line costs, freight and per-order add-ons included", () => {
    const q = price([win(), win({ room: "Den", quantity: 3 })], { color: 1 });
    const built = buildShutterQuote(q, "norman", rates.options);
    expect(built.lines.reduce((s, l) => s + l.costExtendedCents, 0)).toBe(q.supplierCostCents);
    expect(built.dealerTotalCents).toBe(q.supplierCostCents);
  });

  it("names the add-ons in the description, with counts", () => {
    const built = buildShutterQuote(price([win({ options: { shape: 2 } })]), "norman", rates.options);
    expect(built.lines[0].description).toBe("Norman Alpha shutters, Angle top (2)");
  });

  it("splits a window into single lines when its price doesn't divide evenly, so the total stays exact", () => {
    // Three Beta shutters at the first width whose markup price is not a multiple of 3 cents.
    let q = price([win({ lineId: "b", quantity: 3 })]);
    for (let w = 36 * 8; (q.windows[0].priceCents ?? 0) % 3 === 0 && w < 60 * 8; w++) q = price([win({ lineId: "b", quantity: 3, widthEighths: w })]);
    expect((q.windows[0].priceCents ?? 0) % 3).not.toBe(0);
    const built = buildShutterQuote(q, "norman", rates.options);
    expect(built.lines.map((l) => l.qty)).toEqual([1, 1, 1]);
    expect(built.lines.map((l) => l.position)).toEqual([1, 2, 3]);
    expect(built.lines.reduce((s, l) => s + l.msrpUnitCents, 0)).toBe(q.priceCents);
    expect(official(built).clientTotalCents).toBe(q.priceCents);
  });

  it("refuses a quote that has no price", () => {
    const q = priceQuote({ ...rates, markupHundredths: null }, install, { supplier: "norman", windows: [win({ lineId: "b" })], orderOptions: {} });
    expect(() => buildShutterQuote(q, "norman", rates.options)).toThrow("client price");
  });
});

describe("plainInches", () => {
  it("prints whole inches and reduced fractions", () => {
    expect(plainInches(36 * 8)).toBe("36");
    expect(plainInches(36 * 8 + 4)).toBe("36 1/2");
    expect(plainInches(36 * 8 + 2)).toBe("36 1/4");
    expect(plainInches(36 * 8 + 6)).toBe("36 3/4");
    expect(plainInches(36 * 8 + 3)).toBe("36 3/8");
  });
});

describe("costSheetHtml", () => {
  it("lists cost, freight and the margin, and escapes what the team typed", () => {
    const q = price([win({ room: "<Kids> & co" })]);
    const html = costSheetHtml({ quote: q, supplier: "norman", jobLabel: "Jane (PSS-1042)", actor: "owner@example.com", at: new Date("2026-11-12T12:00:00Z"), formatCents });
    expect(html).toContain("&lt;Kids&gt; &amp; co");
    expect(html).toContain(formatCents(q.supplierCostCents));
    expect(html).toContain("never shown to the client");
  });
});

import { describe, expect, it } from "vitest";
import { pickInstallQuote, priceVersion, pricingFingerprint, ruleFor, sendBlockers, type PricingInput } from "@/lib/dc/pricing";

const base: PricingInput = {
  lines: [
    { position: 1, qty: 1, collection: "Duette", msrpUnitCents: 65500, costExtendedCents: 33667, pctOverride: null },
    { position: 3, qty: 2, collection: "Palm Beach Shutters", msrpUnitCents: 48200, costExtendedCents: 33066, pctOverride: null },
  ],
  rules: { Duette: 60, "Palm Beach Shutters": 70 },
  handlingFeeCents: 6600, oversizedFeeCents: 0, dealerTotalCents: 73333,
  waiveHandling: false,
  install: { id: "i1", kind: "final", totalCents: 25000, createdAt: new Date("2026-09-26") },
  noInstall: false,
};
const OK_CONTEXT = { hasTerms: true, isLatest: true, versionStatus: "draft", jobStatus: "visit_booked", customerEmail: "a@b.com" };

describe("priceVersion", () => {
  it("prices each line at % of MSRP and totals products + handling + install", () => {
    const p = priceVersion(base);
    expect(p.lines.map((l) => [l.position, l.sellUnitCents, l.sellExtendedCents])).toEqual([[1, 39300, 39300], [3, 33740, 67480]]);
    expect(p.productsCents).toBe(106780);
    expect(p.clientTotalCents).toBe(106780 + 6600 + 25000);
    expect(p.costCents).toBe(73333);
    // Product margin excludes installation.
    expect(p.marginCents).toBe(106780 + 6600 - 73333);
    expect(p.blockers).toEqual([]);
  });
  it("waiving handling drops it from the client total only", () => {
    const p = priceVersion({ ...base, waiveHandling: true });
    expect(p.handlingChargedCents).toBe(0);
    expect(p.clientTotalCents).toBe(106780 + 25000);
    expect(p.costCents).toBe(73333);
  });
  it("an override beats the rule and is marked", () => {
    const p = priceVersion({ ...base, lines: [{ ...base.lines[0], pctOverride: 50 }] });
    expect(p.lines[0]).toMatchObject({ pct: 50, source: "override", sellUnitCents: 32750 });
  });
  it("a collection with no rule blocks, naming it once, and leaves totals unknown", () => {
    const p = priceVersion({ ...base, rules: { Duette: 60 } });
    expect(p.lines[1]).toMatchObject({ source: "missing", sellUnitCents: null });
    expect(p.productsCents).toBeNull();
    expect(p.clientTotalCents).toBeNull();
    expect(p.blockers).toEqual(["Set a markup for Palm Beach Shutters first."]);
  });
  it("a missing collection on several lines is named once", () => {
    const p = priceVersion({ ...base, rules: {}, lines: [base.lines[0], { ...base.lines[0], position: 2, collection: " Duette " }, { ...base.lines[0], position: 4, collection: "DUETTE" }] });
    expect(p.blockers).toEqual(["Set a markup for Duette first."]);
  });
  it("finds a rule regardless of case and surrounding space", () => {
    expect(ruleFor({ Duette: 60 }, " duette ")).toBe(60);
    const p = priceVersion({ ...base, lines: [{ ...base.lines[0], collection: "DUETTE" }] });
    expect(p.lines[0].sellUnitCents).toBe(39300);
  });
  it("no install quote blocks unless 'No installation' is ticked", () => {
    expect(priceVersion({ ...base, install: null }).blockers).toEqual(["Save an installation price, or tick No installation."]);
    const p = priceVersion({ ...base, install: null, noInstall: true });
    expect(p.blockers).toEqual([]);
    expect(p.installCents).toBe(0);
  });
  it("'No installation' drops a saved install quote from the price", () => {
    const p = priceVersion({ ...base, noInstall: true });
    expect(p.installCents).toBe(0);
    expect(p.installQuoteId).toBeNull();
    expect(p.clientTotalCents).toBe(106780 + 6600);
    expect(p.blockers).toEqual([]);
  });
  it("oversized fees pass through to the client", () => {
    expect(priceVersion({ ...base, oversizedFeeCents: 1500 }).clientTotalCents).toBe(106780 + 6600 + 1500 + 25000);
  });
});

describe("pickInstallQuote", () => {
  const e = (id: string, kind: "estimate" | "final", day: string) => ({ id, kind, totalCents: 1, createdAt: new Date(day) });
  it("prefers the newest final over any estimate", () => {
    expect(pickInstallQuote([e("a", "estimate", "2026-09-27"), e("b", "final", "2026-09-20"), e("c", "final", "2026-09-25")])?.id).toBe("c");
  });
  it("falls back to the newest estimate, then null", () => {
    expect(pickInstallQuote([e("a", "estimate", "2026-09-20"), e("b", "estimate", "2026-09-25")])?.id).toBe("b");
    expect(pickInstallQuote([])).toBeNull();
  });
});

describe("sendBlockers", () => {
  const priced = priceVersion(base);
  it("is empty when everything is in place", () => expect(sendBlockers(priced, OK_CONTEXT)).toEqual([]));
  it.each([
    [{ hasTerms: false }, "Add your contract terms on the Documents page first."],
    [{ isLatest: false }, "A newer version of this quote has arrived. Review that one."],
    [{ versionStatus: "sent" }, "This version has already been sent."],
    [{ jobStatus: "lost" }, "This job is marked Lost."],
    [{ customerEmail: null }, "Add the client's email address to the job first."],
    [{ customerEmail: "  " }, "Add the client's email address to the job first."],
  ])("%j blocks with a plain reason", (patch, reason) => {
    expect(sendBlockers(priced, { ...OK_CONTEXT, ...patch })).toContain(reason);
  });
});

describe("pricingFingerprint", () => {
  it("changes when any line price, the fee choice or the install changes", () => {
    const a = pricingFingerprint(priceVersion(base));
    expect(pricingFingerprint(priceVersion({ ...base, rules: { ...base.rules, Duette: 61 } }))).not.toBe(a);
    expect(pricingFingerprint(priceVersion({ ...base, waiveHandling: true }))).not.toBe(a);
    expect(pricingFingerprint(priceVersion({ ...base, install: { ...base.install!, id: "i2" } }))).not.toBe(a);
    expect(pricingFingerprint(priceVersion(base))).toBe(a);
  });
  it("changes even when the client total does not", () => {
    const two = (pctA: number, pctB: number): PricingInput => ({
      ...base,
      lines: [
        { position: 1, qty: 1, collection: "Duette", msrpUnitCents: 10000, costExtendedCents: 0, pctOverride: pctA },
        { position: 2, qty: 1, collection: "Duette", msrpUnitCents: 10000, costExtendedCents: 0, pctOverride: pctB },
      ],
    });
    // Swapped line prices, same total.
    expect(priceVersion(two(60, 70)).clientTotalCents).toBe(priceVersion(two(70, 60)).clientTotalCents);
    expect(pricingFingerprint(priceVersion(two(60, 70)))).not.toBe(pricingFingerprint(priceVersion(two(70, 60))));
    // Handling moved into the oversized fee, same total.
    const shifted = priceVersion({ ...base, handlingFeeCents: 6500, oversizedFeeCents: 100 });
    expect(shifted.clientTotalCents).toBe(priceVersion(base).clientTotalCents);
    expect(pricingFingerprint(shifted)).not.toBe(pricingFingerprint(priceVersion(base)));
    // Waiving a zero handling fee is still a different choice.
    const noFee = { ...base, handlingFeeCents: 0 };
    expect(pricingFingerprint(priceVersion({ ...noFee, waiveHandling: true }))).not.toBe(pricingFingerprint(priceVersion(noFee)));
  });
});

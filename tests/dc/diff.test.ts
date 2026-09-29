import { describe, expect, it } from "vitest";
import { diffLines } from "@/lib/dc/diff";
import type { StoredLine } from "@/lib/dc/store";

const line = (position: number, over: Partial<StoredLine> = {}): StoredLine => ({
  position, qty: 1, room: "Kitchen", description: `Hunter Douglas Duette ${position}`, collection: "Duette",
  baseCents: 60000, promotionCents: 0, optionsCents: 5500, msrpUnitCents: 65500, costFactor: "0.4940",
  costUnitCents: 32357, costExtendedCents: 32357, options: [], pctOverride: null, markupPct: null,
  sellUnitCents: null, markupOverridden: false, ...over,
});

describe("diffLines", () => {
  it("answers nothing for identical lines, even when options or overrides differ", () => {
    expect(diffLines([line(1), line(2)], [line(1, { options: [["Color", "White"]], pctOverride: 55 }), line(2)])).toEqual([]);
  });

  it("reports an added line", () => {
    expect(diffLines([line(1)], [line(1), line(2)])).toEqual([{ kind: "added", position: 2, description: "Hunter Douglas Duette 2" }]);
  });

  it("reports a removed line", () => {
    expect(diffLines([line(1), line(2)], [line(1)])).toEqual([{ kind: "removed", position: 2, description: "Hunter Douglas Duette 2" }]);
  });

  it("reports a price change", () => {
    expect(diffLines([line(1)], [line(1, { msrpUnitCents: 70000 })])).toEqual([
      { kind: "changed", position: 1, description: "Hunter Douglas Duette 1", fromMsrpCents: 65500, toMsrpCents: 70000, fromQty: 1, toQty: 1 },
    ]);
  });

  it("reports a qty change", () => {
    expect(diffLines([line(1)], [line(1, { qty: 3 })])).toEqual([
      { kind: "changed", position: 1, description: "Hunter Douglas Duette 1", fromMsrpCents: 65500, toMsrpCents: 65500, fromQty: 1, toQty: 3 },
    ]);
  });

  it("orders changes by position across kinds", () => {
    const changes = diffLines([line(1), line(3)], [line(2), line(3, { qty: 2 })]);
    expect(changes.map((c) => [c.kind, c.position])).toEqual([["removed", 1], ["added", 2], ["changed", 3]]);
  });
});

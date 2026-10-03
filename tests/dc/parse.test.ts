import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDealerCopy } from "@/lib/dc/parse";

const ONE = readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8");
const FOUR = readFileSync("tests/fixtures/dc/dealer-copy-4-lines.html", "utf8");

const ok = (html: string) => {
  const result = parseDealerCopy(html);
  if (!result.ok) throw new Error(`refused: ${result.refusal.outcome} ${result.refusal.detail}`);
  return result.quote;
};

describe("parseDealerCopy — real 1-line copy", () => {
  const quote = ok(ONE);
  it("reads the header by label", () => {
    expect(quote.quoteNo).toBe("22250749");
    expect(quote.poReference).toBe("PSS-1042");
    expect(quote.projectNo).toBe(1042);
    expect(quote.clientName).toBe("Test");
  });
  it("reads every money field of the line in exact cents", () => {
    expect(quote.lines).toHaveLength(1);
    const [line] = quote.lines;
    expect(line).toMatchObject({
      position: 1, qty: 1, room: "Living Room", collection: "Duette",
      description: "Hunter Douglas Duette LiteRise Bottom-Up",
      baseCents: 65500, promotionCents: 0, optionsCents: 0, msrpUnitCents: 65500,
      costFactor: "0.4940", costUnitCents: 33667, costExtendedCents: 33667,
    });
  });
  it("keeps every option in order, entities decoded", () => {
    const [line] = quote.lines;
    expect(line.options[0]).toEqual(["Location", "Living Room"]);
    expect(line.options).toContainEqual(["Fabric Type", 'C22 - Architella Elan 3/4" Light Filtering']);
    expect(line.options.at(-1)).toEqual(["Mount Type", "Inside Mount"]);
  });
  it("reads the totals", () => {
    expect(quote).toMatchObject({
      subtotalCents: 33667, handlingFeeCents: 3300, oversizedFeeCents: 0, dealerTotalCents: 36967,
    });
  });
});

describe("parseDealerCopy — real 4-line copy", () => {
  const quote = ok(FOUR);
  it("adds options into MSRP (the motor is in Options)", () => {
    const silhouette = quote.lines[1];
    expect(silhouette).toMatchObject({ baseCents: 161900, optionsCents: 69000, msrpUnitCents: 230900 });
    // Cost is taken as printed, NOT 230900 × 0.494.
    expect(silhouette.costUnitCents).toBe(118683);
  });
  it("keeps fractional sizes as printed", () => {
    expect(quote.lines[1].options).toContainEqual(["Order Width", "48 1/2"]);
    expect(quote.lines[1].options).toContainEqual(["Order Height", "72 3/8"]);
  });
  it("reads qty 2 as per-unit money with extended = qty × unit", () => {
    const shutter = quote.lines[2];
    expect(shutter).toMatchObject({ qty: 2, msrpUnitCents: 48200, costUnitCents: 16533, costExtendedCents: 33066 });
    expect(shutter.collection).toBe("Palm Beach Shutters");
  });
  it("reads an accessory with no room", () => {
    const gateway = quote.lines[3];
    expect(gateway).toMatchObject({ room: "", collection: "Motorization", msrpUnitCents: 20501 });
  });
  it("drops *** notes and the square-foot summary", () => {
    for (const line of quote.lines) {
      expect(line.options.every(([label]) => !label.startsWith("***"))).toBe(true);
    }
    expect(quote.lines).toHaveLength(4);
  });
  it("reconciles: Σ extended = sub-total", () => {
    expect(quote.lines.reduce((sum, l) => sum + l.costExtendedCents, 0)).toBe(quote.subtotalCents);
  });
});

describe("parseDealerCopy — refusals", () => {
  it("no DEALER COSTS column → no-costs", () => {
    const html = ONE.replace("DEALER COSTS", "");
    expect(html).not.toBe(ONE);
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "no-costs" } });
  });
  it("an *** Error line → incomplete, naming the item and the message", () => {
    // Synthetic: DC's real error row prints inside the options table, like its *** Information rows.
    const html = ONE.replace(
      "<tr><td>Mount Type:</td><td>Inside Mount</td></tr>",
      "<tr><td>Mount Type:</td><td>Inside Mount</td></tr><tr><td colspan=2>*** Error: L-Frame Cover Strip - is required ***</td></tr>",
    );
    expect(html).not.toBe(ONE);
    const result = parseDealerCopy(html);
    expect(result).toMatchObject({ ok: false, refusal: { outcome: "incomplete" } });
    if (!result.ok) expect(result.refusal.detail).toBe("Line 1: L-Frame Cover Strip - is required");
  });
  it("an *** Error line with no closing *** → incomplete, naming the line and the message to the end", () => {
    const html = ONE.replace(
      "<tr><td>Mount Type:</td><td>Inside Mount</td></tr>",
      "<tr><td>Mount Type:</td><td>Inside Mount</td></tr><tr><td colspan=2>*** Error: L-Frame Cover Strip - is required</td></tr>",
    );
    expect(html).not.toBe(ONE);
    const result = parseDealerCopy(html);
    expect(result).toMatchObject({ ok: false, refusal: { outcome: "incomplete" } });
    if (!result.ok) expect(result.refusal.detail).toBe("Line 1: L-Frame Cover Strip - is required");
  });
  it("an *** Error: outside every line's options row, even unclosed → incomplete (whole-page rule)", () => {
    const html = ONE.replace("</body>", "<p>*** Error: Order could not be priced</p></body>");
    expect(html).not.toBe(ONE);
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "incomplete" } });
  });
  it("totals that do not reconcile → unreadable (never import a figure that may be wrong)", () => {
    const html = ONE.replace(">369.67<", ">369.68<");
    expect(html).not.toBe(ONE);
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "unreadable" } });
  });
  it("a line's extended cost that does not sum to the sub-total → unreadable", () => {
    // Only the line's Extended cell changes; sub-total + fees = total still holds.
    const html = ONE.replace(">336.67</td></tr><tr><td colspan=2>", ">336.68</td></tr><tr><td colspan=2>");
    expect(html).not.toBe(ONE);
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "unreadable" } });
  });
  it("a PO that is not PSS-#### → no-po", () => {
    const html = ONE.replace("<td>PSS-1042</td>", "<td>852</td>");
    expect(html).not.toBe(ONE);
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "no-po" } });
  });
  it("a page that is not a Dealer Copy → unreadable", () => {
    expect(parseDealerCopy("<html><body>hello</body></html>")).toMatchObject({ ok: false, refusal: { outcome: "unreadable" } });
  });
  it("trims the collection so 'Duette ' keys the same rule as 'Duette'", () => {
    const html = ONE.replace("<td>Collection:</td><td>Duette</td>", "<td>Collection:</td><td> Duette&nbsp;</td>");
    expect(html).not.toBe(ONE);
    expect(ok(html).lines[0].collection).toBe("Duette");
  });
  it("a line with no Collection option → unreadable, naming the line", () => {
    const html = ONE.replace("<tr><td>Collection:</td><td>Duette</td></tr>", "");
    expect(html).not.toBe(ONE);
    const result = parseDealerCopy(html);
    expect(result).toMatchObject({ ok: false, refusal: { outcome: "unreadable" } });
    if (!result.ok) expect(result.refusal.detail).toContain("Line 1");
  });
  it("a refusal after the header was read carries the quote number and PO, so it can be named", () => {
    const html = ONE.replace("DEALER COSTS", "");
    expect(parseDealerCopy(html)).toMatchObject({ ok: false, refusal: { outcome: "no-costs", quoteNo: "22250749", poReference: "PSS-1042" } });
    const noPo = ONE.replace("<td>PSS-1042</td>", "<td>852</td>");
    expect(parseDealerCopy(noPo)).toMatchObject({ ok: false, refusal: { outcome: "no-po", quoteNo: "22250749", poReference: "852" } });
  });
  it("a page with no quote number carries none", () => {
    const result = parseDealerCopy("<html><body>hello</body></html>");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.quoteNo).toBeUndefined();
  });
});

describe("parseDealerCopy — PO Reference and quote options", () => {
  const withPo = (po: string) => {
    const html = ONE.replace("<td>PSS-1042</td>", `<td>${po}</td>`);
    if (html === ONE && po !== "PSS-1042") throw new Error("fixture has no PSS-1042 cell");
    return html;
  };

  it("PSS-1042 is option A of job 1042", () => {
    const quote = ok(withPo("PSS-1042"));
    expect(quote).toMatchObject({ projectNo: 1042, option: "A", poReference: "PSS-1042" });
  });

  it("PSS-1042-B is option B of job 1042", () => {
    const quote = ok(withPo("PSS-1042-B"));
    expect(quote).toMatchObject({ projectNo: 1042, option: "B", poReference: "PSS-1042-B" });
  });

  it.each(["PSS-1042-A", "PSS-1042-b", "PSS-1042-", "PSS-1042-BB", "PSS-1042 B"])("refuses %s as no-po: A is never written, letters are capitals", (po) => {
    const result = parseDealerCopy(withPo(po));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.outcome).toBe("no-po");
  });

  it("refuses a PO Reference over DC's 20-character limit", () => {
    expect(ok(withPo("PSS-12345678901234-B")).option).toBe("B"); // 20 characters
    const result = parseDealerCopy(withPo("PSS-123456789012345-B")); // 21 characters
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.outcome).toBe("no-po");
  });
});

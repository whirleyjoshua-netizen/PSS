import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { orderBeforeTaxCents, parseOrderConfirmation, parseOrderReceipt } from "@/lib/dc/order-parse";

const ORDER = readFileSync("tests/fixtures/dc/hd-order-confirmation.html", "utf8");
const RECEIPT = readFileSync("tests/fixtures/dc/hd-order-receipt.html", "utf8");

describe("parseOrderConfirmation", () => {
  it("reads HD's order number, PO, date, status and every total from the real email", () => {
    expect(parseOrderConfirmation(ORDER)).toEqual({
      ok: true,
      order: {
        orderNo: "14286505", poReference: "PSS-1042-E", projectNo: 1042, option: "E", orderDate: "2026-10-12", status: "Confirmed",
        subtotalCents: 109113, oversizeCents: 0, handlingCents: 5500, taxCents: 9138, totalCents: 123751,
      },
    });
  });
  it("adds up HD's figures before tax, which is what a Dealer Copy's dealer total compares with", () => {
    const result = parseOrderConfirmation(ORDER);
    if (!result.ok) throw new Error("fixture must parse");
    expect(orderBeforeTaxCents(result.order)).toBe(114613);
  });
  it("PSS-1042 with no letter is option A", () => {
    const result = parseOrderConfirmation(ORDER.replace("PSS-1042-E", "PSS-1042"));
    expect(result).toMatchObject({ ok: true, order: { poReference: "PSS-1042", projectNo: 1042, option: "A" } });
  });
  it("refuses a PO that is not a PSS number, naming the order", () => {
    expect(parseOrderConfirmation(ORDER.replace("PSS-1042-E", "Jennie"))).toEqual({
      ok: false, outcome: "no-po", detail: 'HD order 14286505 has PO "Jennie"', orderNo: "14286505", poReference: "Jennie",
    });
  });
  it("refuses totals that do not add up rather than recording a wrong cost", () => {
    const result = parseOrderConfirmation(ORDER.replace(">91.38<", ">91.39<"));
    expect(result).toMatchObject({ ok: false, outcome: "unreadable", detail: "HD order 14286505 totals do not add up" });
  });
  it("refuses an order HD has not confirmed", () => {
    const result = parseOrderConfirmation(ORDER.replace("</b>Confirmed<", "</b>On Hold<"));
    expect(result).toMatchObject({ ok: false, outcome: "unreadable", detail: 'HD order 14286505 has status "On Hold"' });
  });
  it("refuses a missing or malformed order date", () => {
    const result = parseOrderConfirmation(ORDER.replace("10/12/2026", "Oct 12"));
    expect(result).toMatchObject({ ok: false, outcome: "unreadable", detail: "HD order 14286505 has no order date" });
  });
  it("refuses a page that is not an order confirmation", () => {
    expect(parseOrderConfirmation("<html><body>Hello</body></html>")).toMatchObject({ ok: false, outcome: "unreadable", detail: "No order number" });
  });
});

describe("parseOrderReceipt", () => {
  it("reads the DC quote number and PO from the receipt's sentence", () => {
    expect(parseOrderReceipt(RECEIPT)).toEqual({ ok: true, receipt: { quoteNo: "22293638", poReference: "PSS-1042-E", projectNo: 1042, option: "E" } });
  });
  it("refuses a receipt whose PO is not a PSS number", () => {
    expect(parseOrderReceipt(RECEIPT.replace("PSS-1042-E", "SMITH"))).toEqual({ ok: false, outcome: "no-po", detail: 'Quote 22293638 has PO "SMITH"' });
  });
  it("refuses a receipt without the sentence", () => {
    expect(parseOrderReceipt("<html><body>Thanks</body></html>")).toEqual({ ok: false, outcome: "unreadable", detail: "No quote number or PO" });
  });
});

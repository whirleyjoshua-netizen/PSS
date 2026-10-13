import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseOrderConfirmation } from "@/lib/dc/order-parse";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/dc/order-store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const values = (call: unknown[]) => call.slice(1);

const JOB = "11111111-1111-4111-8111-111111111111";
const parsed = parseOrderConfirmation(readFileSync("tests/fixtures/dc/hd-order-confirmation.html", "utf8"));
if (!parsed.ok) throw new Error("fixture must parse");
const order = parsed.order;
const received = new Date("2026-10-12T22:34:03Z");

beforeEach(() => sql.mockReset());

describe("recordOrder", () => {
  const record = () => store.recordOrder({ messageId: "<o@x>", receivedAt: received, leadId: JOB, order, fileId: "f1", actor: "Direct Connect" });

  it("writes the message, order, stage, order date and event in ONE statement", async () => {
    sql.mockResolvedValue([{ from_status: "measure", to_status: "ordered", quoted: 114613 }]);
    expect(await record()).toEqual({ fromStatus: "measure", toStatus: "ordered", quotedDealerTotalCents: 114613 });
    expect(sql).toHaveBeenCalledTimes(1);
    const statement = text(sql.mock.calls[0]);
    for (const part of [
      "insert into ingested_messages", "'ordered'", "on conflict (message_id) do nothing",
      "insert into dc_orders", "on conflict (hd_order_no) do nothing",
      "status not in ('superseded', 'cancelled')", "order by (status = 'signed') desc, version desc",
      "then 'ordered' else leads.status end", "ordered_on = coalesce(leads.ordered_on, ?::date)",
      "insert into job_events", "then 'stage' else 'quote' end",
    ]) expect(statement).toContain(part);
  });
  it("binds every figure in column order", async () => {
    sql.mockResolvedValue([]);
    await record();
    const bound = values(sql.mock.calls[0]);
    expect(bound.slice(0, 5)).toEqual(["<o@x>", received, JOB, "PSS-1042-E", "HD order 14286505"]);
    expect(bound.slice(5, 7)).toEqual([JOB, "E"]);
    // The order row: id, then lead, option, PO, order no, date, the five figures, file and received_at.
    const insert = bound.slice(7, 20);
    expect(insert[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(insert.slice(1)).toEqual([JOB, "E", "PSS-1042-E", "14286505", "2026-10-12", 109113, 0, 5500, 9138, 123751, "f1", received]);
  });
  it("moves only from Signed, Sold and Official measure", async () => {
    sql.mockResolvedValue([]);
    await record();
    expect(values(sql.mock.calls[0])).toContainEqual(["signed", "sold", "measure"]);
    expect(store.ORDERABLE_STAGES).toEqual(["signed", "sold", "measure"]);
  });
  it("logs HD's order number, PO, total and tax", async () => {
    sql.mockResolvedValue([]);
    await record();
    expect(values(sql.mock.calls[0])).toContain("HD order 14286505 confirmed for PSS-1042-E: $1,237.51 including $91.38 tax");
  });
  it("answers null when the message or order was already recorded", async () => {
    sql.mockResolvedValue([]);
    expect(await record()).toBeNull();
  });
  it("answers a null quote when the option had none", async () => {
    sql.mockResolvedValue([{ from_status: "ordered", to_status: "ordered", quoted: null }]);
    expect(await record()).toEqual({ fromStatus: "ordered", toStatus: "ordered", quotedDealerTotalCents: null });
  });
});

describe("receipts", () => {
  it("records a receipt with its quote number and PO", async () => {
    sql.mockResolvedValue([]);
    await store.recordReceipt({ messageId: "<r@x>", receivedAt: received, leadId: JOB, quoteNo: "22293638", poReference: "PSS-1042-E" });
    expect(text(sql.mock.calls[0])).toContain("'receipt'");
    expect(text(sql.mock.calls[0])).toContain("on conflict (message_id) do nothing");
    expect(values(sql.mock.calls[0])).toEqual(["<r@x>", received, JOB, "22293638", "PSS-1042-E"]);
  });
  it("finds unwarned receipts no HD order email for the same PO has answered", async () => {
    sql.mockResolvedValue([{ message_id: "<r@x>", lead_id: JOB, dc_quote_no: "22293638", po_reference: "PSS-1042-E", received_at: "2026-10-12T22:09:27Z" }]);
    const before = new Date("2026-10-12T23:00:00Z");
    expect(await store.staleReceipts(before)).toEqual([
      { messageId: "<r@x>", leadId: JOB, quoteNo: "22293638", poReference: "PSS-1042-E", receivedAt: new Date("2026-10-12T22:09:27Z") },
    ]);
    const statement = text(sql.mock.calls[0]);
    for (const part of ["m.outcome = 'receipt'", "m.warned_at is null", "m.lead_id is not null", "not exists",
      "x.po_reference = m.po_reference and x.outcome <> 'receipt'"]) expect(statement).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual([before]);
  });
  it("marks only receipts as warned, and does nothing for none", async () => {
    sql.mockResolvedValue([]);
    await store.markReceiptsWarned([]);
    expect(sql).not.toHaveBeenCalled();
    await store.markReceiptsWarned(["<r@x>"]);
    expect(text(sql.mock.calls[0])).toContain("outcome = 'receipt'");
    expect(values(sql.mock.calls[0])).toEqual([["<r@x>"]]);
  });
});

describe("listOrders", () => {
  it("returns nothing for a malformed id without querying", async () => {
    expect(await store.listOrders("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
  it("maps every column", async () => {
    sql.mockResolvedValue([{
      id: "o1", lead_id: JOB, option: "E", po_reference: "PSS-1042-E", hd_order_no: "14286505", order_date: "2026-10-12",
      subtotal_cents: 109113, oversize_cents: 0, handling_cents: 5500, tax_cents: 9138, total_cents: 123751,
      quoted_dealer_total_cents: 114613, file_id: "f1", received_at: "2026-10-12T22:34:03Z",
    }]);
    expect(await store.listOrders(JOB)).toEqual([{
      id: "o1", leadId: JOB, option: "E", poReference: "PSS-1042-E", hdOrderNo: "14286505", orderDate: "2026-10-12",
      subtotalCents: 109113, oversizeCents: 0, handlingCents: 5500, taxCents: 9138, totalCents: 123751,
      quotedDealerTotalCents: 114613, fileId: "f1", receivedAt: received,
    }]);
  });
});

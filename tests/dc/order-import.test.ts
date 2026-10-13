import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const store = { isProcessed: vi.fn(), recordOutcome: vi.fn(), findJobByProjectNo: vi.fn(), quoteOptionExists: vi.fn() };
vi.mock("@/lib/dc/store", () => store);
const orderStore = { orderRecorded: vi.fn(), recordOrder: vi.fn(), recordReceipt: vi.fn() };
vi.mock("@/lib/dc/order-store", () => orderStore);
const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const notify = {
  notifyOwners: vi.fn(), orderEmail: vi.fn(() => ({ subject: "ordered", text: "t" })), orderRefusalEmail: vi.fn(() => ({ subject: "refused", text: "t" })),
};
vi.mock("@/lib/dc/notify", () => notify);
const { importOrderConfirmation, importOrderReceipt } = await import("@/lib/dc/order-import");

const ORDER = readFileSync("tests/fixtures/dc/hd-order-confirmation.html", "utf8");
const RECEIPT = readFileSync("tests/fixtures/dc/hd-order-receipt.html", "utf8");
const JOB = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Test", projectNo: 1042 };
const PDF = { name: "PRINT New Order # 14286505 for Sidemark: Test.PDF", bytes: Buffer.from("%PDF-1.4") };
const input = { internetMessageId: "<o@x>", receivedAt: new Date("2026-10-12T22:34:03Z"), html: ORDER, pdf: PDF };

beforeEach(() => {
  for (const f of [...Object.values(store), ...Object.values(orderStore), ...Object.values(files)]) f.mockReset();
  notify.notifyOwners.mockReset().mockResolvedValue(undefined);
  notify.orderEmail.mockClear();
  notify.orderRefusalEmail.mockClear();
  store.isProcessed.mockResolvedValue(false);
  store.findJobByProjectNo.mockResolvedValue(JOB);
  store.quoteOptionExists.mockResolvedValue(true);
  orderStore.orderRecorded.mockResolvedValue(false);
  files.createFile.mockResolvedValue({ id: "f1" });
  orderStore.recordOrder.mockResolvedValue({ fromStatus: "measure", toStatus: "ordered", quotedDealerTotalCents: 114613 });
});

describe("importOrderConfirmation", () => {
  it("files HD's PDF as an internal HD order, records the order on the PO's job and option, and tells the owners", async () => {
    const result = await importOrderConfirmation(input);
    expect(result).toEqual({ outcome: "ordered", leadId: JOB.id, detail: "HD order 14286505" });
    expect(store.findJobByProjectNo).toHaveBeenCalledWith(1042);
    expect(store.quoteOptionExists).toHaveBeenCalledWith(JOB.id, "E");
    expect(files.createFile).toHaveBeenCalledWith(expect.objectContaining({
      leadId: JOB.id, kind: "document", name: "HD ORDER 14286505.pdf", contentType: "application/pdf", docType: "hd_order", actor: "Direct Connect",
    }));
    expect(orderStore.recordOrder).toHaveBeenCalledWith({
      messageId: "<o@x>", receivedAt: input.receivedAt, leadId: JOB.id, fileId: "f1", actor: "Direct Connect",
      order: expect.objectContaining({ orderNo: "14286505", poReference: "PSS-1042-E", option: "E", totalCents: 123751 }),
    });
    expect(notify.orderEmail).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB.id, fromStatus: "measure", toStatus: "ordered", quotedCents: 114613 }));
    expect(notify.notifyOwners).toHaveBeenCalledWith({ subject: "ordered", text: "t" });
  });
  it("records the order with no file when the email had no usable PDF", async () => {
    await importOrderConfirmation({ ...input, pdf: null });
    expect(files.createFile).not.toHaveBeenCalled();
    expect(orderStore.recordOrder).toHaveBeenCalledWith(expect.objectContaining({ fileId: null }));
  });
  it("RELEASE GATE: a PO naming no job records nothing on any job and tells the owners", async () => {
    store.findJobByProjectNo.mockResolvedValue(null);
    const result = await importOrderConfirmation(input);
    expect(result).toEqual({ outcome: "no-match", leadId: null, detail: "PSS-1042-E" });
    expect(files.createFile).not.toHaveBeenCalled();
    expect(orderStore.recordOrder).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-match", leadId: null, detail: "PSS-1042-E", poReference: "PSS-1042-E" }));
    expect(notify.orderRefusalEmail).toHaveBeenCalledWith({ outcome: "no-match", orderNo: "14286505", detail: "PSS-1042-E" });
  });
  it("RELEASE GATE: an option never added on the job matches nothing", async () => {
    store.quoteOptionExists.mockResolvedValue(false);
    expect((await importOrderConfirmation(input)).outcome).toBe("no-match");
    expect(orderStore.recordOrder).not.toHaveBeenCalled();
  });
  it("RELEASE GATE: PSS-01042 is not job 1042's number", async () => {
    const result = await importOrderConfirmation({ ...input, html: ORDER.replace("PSS-1042-E", "PSS-01042-E") });
    expect(result.outcome).toBe("no-match");
    expect(orderStore.recordOrder).not.toHaveBeenCalled();
  });
  it("an unreadable or PO-less confirmation is recorded and the owners are asked to move the job by hand", async () => {
    const result = await importOrderConfirmation({ ...input, html: ORDER.replace("PSS-1042-E", "Jennie") });
    expect(result.outcome).toBe("no-po");
    expect(store.findJobByProjectNo).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-po", leadId: null, poReference: "Jennie" }));
    expect(notify.orderRefusalEmail).toHaveBeenCalledWith({ outcome: "no-po", orderNo: "14286505", detail: 'HD order 14286505 has PO "Jennie"' });
  });
  it("an order number already recorded is 'unchanged': no file, no second order, no email", async () => {
    orderStore.orderRecorded.mockResolvedValue(true);
    const result = await importOrderConfirmation(input);
    expect(result.outcome).toBe("unchanged");
    expect(files.createFile).not.toHaveBeenCalled();
    expect(orderStore.recordOrder).not.toHaveBeenCalled();
    expect(notify.notifyOwners).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unchanged", leadId: JOB.id }));
  });
  it("a message already processed is skipped before anything is read", async () => {
    store.isProcessed.mockResolvedValue(true);
    expect((await importOrderConfirmation(input)).outcome).toBe("unchanged");
    expect(store.findJobByProjectNo).not.toHaveBeenCalled();
  });
  it("when another run recorded it first, this run's PDF is removed and nothing is said", async () => {
    orderStore.recordOrder.mockResolvedValue(null);
    expect((await importOrderConfirmation(input)).outcome).toBe("unchanged");
    expect(files.deleteFile).toHaveBeenCalledWith("f1", "Direct Connect");
    expect(notify.notifyOwners).not.toHaveBeenCalled();
  });
  it("when recording fails, the PDF is removed and the error rethrown so the run retries", async () => {
    orderStore.recordOrder.mockRejectedValue(new Error("db down"));
    files.deleteFile.mockResolvedValue(true);
    await expect(importOrderConfirmation(input)).rejects.toThrow("db down");
    expect(files.deleteFile).toHaveBeenCalledWith("f1", "Direct Connect");
  });
  it("a job deleted mid-import fails the run, so the next run sees no job and tells the owners", async () => {
    files.createFile.mockResolvedValue(null);
    await expect(importOrderConfirmation(input)).rejects.toThrow("disappeared");
    expect(orderStore.recordOrder).not.toHaveBeenCalled();
  });
  it("a refused confirmation records its PO, so the receipt is not also reported as unconfirmed", async () => {
    await importOrderConfirmation({ ...input, html: ORDER.replace(">91.38<", ">91.39<") });
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unreadable", poReference: "PSS-1042-E" }));
  });
  it("a failing owner email does not fail the import", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    notify.notifyOwners.mockRejectedValue(new Error("Resend down"));
    expect((await importOrderConfirmation(input)).outcome).toBe("ordered");
    spy.mockRestore();
  });
});

describe("importOrderReceipt", () => {
  const receipt = { internetMessageId: "<r@x>", receivedAt: new Date("2026-10-12T22:09:27Z"), html: RECEIPT };
  it("records the receipt against the PO's job, quietly", async () => {
    const result = await importOrderReceipt(receipt);
    expect(result).toEqual({ outcome: "receipt", leadId: JOB.id, detail: null });
    expect(orderStore.recordReceipt).toHaveBeenCalledWith({
      messageId: "<r@x>", receivedAt: receipt.receivedAt, leadId: JOB.id, quoteNo: "22293638", poReference: "PSS-1042-E",
    });
    expect(notify.notifyOwners).not.toHaveBeenCalled();
  });
  it("a receipt naming no job is recorded as no-match without an email: HD's confirmation will say so", async () => {
    store.findJobByProjectNo.mockResolvedValue(null);
    const result = await importOrderReceipt(receipt);
    expect(result.outcome).toBe("no-match");
    expect(orderStore.recordReceipt).not.toHaveBeenCalled();
    expect(store.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no-match", dcQuoteNo: "22293638", detail: "PSS-1042-E" }));
    expect(notify.notifyOwners).not.toHaveBeenCalled();
  });
});

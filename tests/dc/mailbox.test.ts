import { beforeEach, describe, expect, it, vi } from "vitest";
const graphJson = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphJson, GraphError: class extends Error {} }));
vi.mock("@/lib/calendar/config", () => ({ calendarConfig: () => ({ mailbox: "support@premiershadesolutions.com" }) }));
const mailbox = await import("@/lib/dc/mailbox");
beforeEach(() => graphJson.mockReset());

describe("listCandidateMessages", () => {
  it("only GETs, filters by time, and keeps DC-shaped mail from the DC sender", async () => {
    graphJson.mockResolvedValueOnce({ value: [
      { id: "a", internetMessageId: "<a@x>", subject: "DEALER COPY #22250749, PO PSS-1042", receivedDateTime: "2026-09-27T19:30:00Z", from: { emailAddress: { address: "Retailer@HunterDouglas.com" } } },
      { id: "b", internetMessageId: "<b@x>", subject: "DEALER COPY #1, PO PSS-1", receivedDateTime: "2026-09-27T19:31:00Z", from: { emailAddress: { address: "someone@evil.com" } } },
      { id: "c", internetMessageId: "<c@x>", subject: "Lunch?", receivedDateTime: "2026-09-27T19:32:00Z", from: { emailAddress: { address: "retailer@hunterdouglas.com" } } },
    ] });
    const found = await mailbox.listCandidateMessages(new Date("2026-09-27T18:00:00Z"));
    expect(found.map((m) => m.id)).toEqual(["a"]);
    const [path, init] = graphJson.mock.calls[0];
    expect(init?.method ?? "GET").toBe("GET");
    expect(decodeURIComponent(path)).toContain("receivedDateTime ge 2026-09-27T18:00:00.000Z");
    expect(path).toContain("internetMessageId");
  });
  it("follows @odata.nextLink", async () => {
    graphJson.mockResolvedValueOnce({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next" }).mockResolvedValueOnce({ value: [] });
    await mailbox.listCandidateMessages(new Date());
    expect(graphJson.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/next");
  });
});

describe("htmlAttachments", () => {
  it("returns every .html file attachment, decoded, with anything over 1 MB listed but not decoded", async () => {
    graphJson.mockResolvedValueOnce({ value: [
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "DEALER COPY 1.html", size: 10, contentBytes: Buffer.from("<html>").toString("base64") },
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "logo.png", size: 10, contentBytes: "" },
      { "@odata.type": "#microsoft.graph.itemAttachment", name: "forwarded.html", size: 10 },
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "big.html", size: 2_000_000, contentBytes: Buffer.from("<html>").toString("base64") },
    ] });
    const found = await mailbox.htmlAttachments("a");
    expect(found).toEqual([
      { name: "DEALER COPY 1.html", bytes: Buffer.from("<html>") },
      { name: "big.html", bytes: null },
    ]);
  });
});

describe("mailKind", () => {
  it("names each DC and HD email by sender and subject together", () => {
    expect(mailbox.mailKind("retailer@hunterdouglas.com", "DEALER COPY #22293638, PO PSS-1042-E")).toBe("dealer-copy");
    expect(mailbox.mailKind("retailer@hunterdouglas.com", "Confirming Receipt of Quote #22293638 / Sidemark: Test, Client")).toBe("receipt");
    expect(mailbox.mailKind("donotreply@hunterdouglas.com", "New Order # 14286505 for Sidemark: Test, Clie")).toBe("order");
  });
  it("ignores the right subject from the wrong sender, and other HD mail", () => {
    expect(mailbox.mailKind("retailer@hunterdouglas.com", "New Order # 14286505 for Sidemark: Test")).toBeNull();
    expect(mailbox.mailKind("donotreply@hunterdouglas.com", "Confirming Receipt of Quote #1 / Sidemark: Test")).toBeNull();
    expect(mailbox.mailKind("someone@evil.com", "New Order # 1 for Sidemark: Test")).toBeNull();
    expect(mailbox.mailKind("donotreply@hunterdouglas.com", "Your order has shipped")).toBeNull();
  });
});

describe("listCandidateMessages kinds", () => {
  it("returns order and receipt mail with its kind", async () => {
    graphJson.mockResolvedValueOnce({ value: [
      { id: "r", internetMessageId: "<r@x>", subject: "Confirming Receipt of Quote #22293638 / Sidemark: Test, Client", receivedDateTime: "2026-10-12T22:09:27Z", from: { emailAddress: { address: "retailer@hunterdouglas.com" } } },
      { id: "o", internetMessageId: "<o@x>", subject: "New Order # 14286505 for Sidemark: Test, Clie", receivedDateTime: "2026-10-12T22:34:03Z", from: { emailAddress: { address: "DoNotReply@HunterDouglas.com" } } },
    ] });
    const found = await mailbox.listCandidateMessages(new Date("2026-10-12T00:00:00Z"));
    expect(found.map((m) => [m.id, m.kind])).toEqual([["r", "receipt"], ["o", "order"]]);
  });
});

describe("pdfAttachments and messageHtml", () => {
  it("returns every .pdf file attachment, decoded, with anything over 5 MB listed but not decoded", async () => {
    graphJson.mockResolvedValueOnce({ value: [
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "PRINT New Order # 1 for Sidemark: Test.PDF", size: 10, contentBytes: Buffer.from("%PDF").toString("base64") },
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "page.html", size: 10, contentBytes: "" },
      { "@odata.type": "#microsoft.graph.fileAttachment", name: "huge.pdf", size: 6_000_000, contentBytes: Buffer.from("%PDF").toString("base64") },
    ] });
    expect(await mailbox.pdfAttachments("o")).toEqual([
      { name: "PRINT New Order # 1 for Sidemark: Test.PDF", bytes: Buffer.from("%PDF") },
      { name: "huge.pdf", bytes: null },
    ]);
  });
  it("GETs only the message body", async () => {
    graphJson.mockResolvedValueOnce({ body: { contentType: "html", content: "<html>order</html>" } });
    expect(await mailbox.messageHtml("o")).toBe("<html>order</html>");
    const [path, init] = graphJson.mock.calls[0];
    expect(path).toBe("users/support%40premiershadesolutions.com/messages/o?$select=body");
    expect(init?.method ?? "GET").toBe("GET");
  });
});

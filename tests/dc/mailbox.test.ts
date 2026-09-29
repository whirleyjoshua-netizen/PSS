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

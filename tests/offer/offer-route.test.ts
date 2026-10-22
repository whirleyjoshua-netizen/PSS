import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertOfferLead = vi.fn();
const sendOfferNotification = vi.fn();
const sendOfferEmail = vi.fn();
vi.mock("@/lib/leads/offer-signup", async (original) => ({
  ...(await original<object>()), insertOfferLead, sendOfferNotification, sendOfferEmail,
}));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));

const { POST } = await import("@/app/api/offer/route");
const { HOLIDAY_LEAD_NOTE } = await import("@/content/holiday");
const { SOLAR_LEAD_NOTE } = await import("@/content/solar-offer");

const body = { name: "Dana Reyes", email: "Dana@Example.com" };
const request = (payload: unknown) =>
  new Request("http://localhost/api/offer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date("2026-10-22T20:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  insertOfferLead.mockReset().mockResolvedValue({ id: "abc" });
  sendOfferNotification.mockReset().mockResolvedValue(undefined);
  sendOfferEmail.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("POST /api/offer", () => {
  it("stores the sign-up with both running offers in its notes, tells the owners, then emails the offer", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    const lead = insertOfferLead.mock.calls[0][0];
    expect(lead).toMatchObject({ name: "Dana Reyes", email: "dana@example.com" });
    expect(lead.notes).toContain("not booked yet");
    expect(lead.notes).toContain(HOLIDAY_LEAD_NOTE);
    expect(lead.notes).toContain(SOLAR_LEAD_NOTE);
    expect(sendOfferNotification).toHaveBeenCalledWith(expect.objectContaining({ notes: lead.notes }), lead.id, ["owner@example.com"]);
    expect(sendOfferEmail).toHaveBeenCalledTimes(1);
  });

  it("asks for a name and a real email", async () => {
    const response = await POST(request({ name: "Dana", email: "nope" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Please enter a valid email address.");
    expect(insertOfferLead).not.toHaveBeenCalled();
  });

  it("quietly drops a bot that filled the spam trap", async () => {
    const response = await POST(request({ ...body, company: "Acme" }));
    expect(response.status).toBe(201);
    expect(insertOfferLead).not.toHaveBeenCalled();
    expect(sendOfferEmail).not.toHaveBeenCalled();
  });

  it("never loses a sign-up: one failed write is still a success", async () => {
    insertOfferLead.mockRejectedValue(new Error("db down"));
    expect((await POST(request(body))).status).toBe(201);
    expect(sendOfferEmail).toHaveBeenCalled();
  });

  it("shows an error, and sends no offer, only when neither write worked", async () => {
    insertOfferLead.mockRejectedValue(new Error("db down"));
    sendOfferNotification.mockRejectedValue(new Error("mail down"));
    expect((await POST(request(body))).status).toBe(502);
    expect(sendOfferEmail).not.toHaveBeenCalled();
  });

  it("still thanks the visitor when only their offer email fails", async () => {
    sendOfferEmail.mockRejectedValue(new Error("bounce"));
    expect((await POST(request(body))).status).toBe(201);
  });

  it("refuses once the offers have ended, rather than sending an empty offer", async () => {
    vi.setSystemTime(new Date("2026-11-16T08:00:00Z"));
    const response = await POST(request(body));
    expect(response.status).toBe(410);
    expect(insertOfferLead).not.toHaveBeenCalled();
  });
});

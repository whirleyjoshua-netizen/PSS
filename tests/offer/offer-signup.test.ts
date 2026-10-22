import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { insertOfferLead, offerSignupNotes, sendOfferEmail, sendOfferNotification } = await import("@/lib/leads/offer-signup");
const { business } = await import("@/content/business");
const { HOLIDAY_FORM_LINE } = await import("@/content/holiday");
const { SOLAR_FORM_LINE, SOLAR_LEAD_NOTE } = await import("@/content/solar-offer");
const { conversionsCsv } = await import("@/lib/leads/conversions");
const { leadSourceLabel } = await import("@/lib/leads/schema");

const NOW = new Date("2026-10-22T20:00:00Z");
const input = { name: "Dana Reyes", email: "dana@example.com" };
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([{ id: "abc" }]);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("insertOfferLead", () => {
  it("files it as an offer pop-up lead with no phone or city", async () => {
    await insertOfferLead({ ...input, id: "abc", notes: "n" });
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("insert into leads (id, name, phone, email, city, notes, source, assigned_to,");
    expect(call.slice(1, 8)).toEqual(["abc", "Dana Reyes", "", "dana@example.com", "", "n", "offer"]);
    expect(leadSourceLabel("offer")).toBe("Offer pop-up");
  });
});

describe("offerSignupNotes", () => {
  it("only names the offers still running", () => {
    expect(offerSignupNotes(NOW)).toContain(SOLAR_LEAD_NOTE);
    expect(offerSignupNotes(new Date("2026-11-16T08:00:00Z"))).not.toContain(SOLAR_LEAD_NOTE);
  });
});

describe("the emails", () => {
  it("sends the visitor each offer and a link to book", async () => {
    await sendOfferEmail(input, NOW);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("dana@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.subject).toBe(`Your ${business.name} offer, Dana`);
    expect(message.text).toMatch(/^Hi Dana,/);
    expect(message.text).toContain(`- ${HOLIDAY_FORM_LINE}`);
    expect(message.text).toContain(`- ${SOLAR_FORM_LINE}`);
    expect(message.text).toContain(`${business.domain}/#book`);
    expect(message.text).toContain(business.phone.display);
  });

  it("tells the owners it is a sign-up to follow up by email, not a consultation request", async () => {
    await sendOfferNotification({ ...input, notes: "the notes" }, "abc", ["owner@example.com"]);
    const message = send.mock.calls[0][0];
    expect(message.to).toEqual(["owner@example.com"]);
    expect(message.subject).toBe("New offer sign-up — Dana Reyes");
    expect(message.text).toContain("Not booked yet, and no phone number: follow up by email.");
    expect(message.text).toContain("/admin/jobs/abc");
    expect(message.text).toContain("the notes");
  });
});

describe("Google Ads conversions", () => {
  it("never count a sign-up as a consultation request, but do count it once it books", () => {
    const csv = conversionsCsv([{ gclid: "x", source: "offer", createdAt: new Date("2026-10-22T00:00:00Z"),
      bookedAt: new Date("2026-10-25T00:00:00Z"), soldAt: null, soldCents: null }]);
    expect(csv).not.toContain("Consultation request");
    expect(csv).toContain("x,Appointment booked");
  });
});

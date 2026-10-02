import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendCustomerConfirmation, sendLeadNotification } = await import("@/lib/leads/email");
const { business } = await import("@/content/business");

const input = {
  name: "Dana Reyes",
  phone: "7025550134",
  email: "dana@example.com",
  city: "Henderson",
  source: "hero" as const,
};

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("sendCustomerConfirmation", () => {
  it("writes to the visitor, by first name, with replies going to the business", async () => {
    await sendCustomerConfirmation(input);

    const message = send.mock.calls[0][0];
    expect(message.to).toBe("dana@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.text).toMatch(/^Hi Dana,/);
  });

  it("repeats the next steps and the phone number", async () => {
    await sendCustomerConfirmation(input);

    const { text } = send.mock.calls[0][0];
    expect(text).toMatch(/3 business days/i);
    expect(text).toContain(business.phone.display);
  });

  it("throws when Resend rejects the message", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });

    await expect(sendCustomerConfirmation(input)).rejects.toThrow(/domain not verified/);
  });
});

describe("sendLeadNotification", () => {
  beforeEach(() => {
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "owners@example.com");
    vi.stubEnv("ADMIN_BASE_URL", "https://pss.test/");
  });

  it("sends a lead with no email address (a Google lead form lead) with no reply-to", async () => {
    await sendLeadNotification({ ...input, email: null, source: "google_form" }, "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    const message = send.mock.calls[0][0];
    expect(message.replyTo).toBeUndefined();
    expect(message.text).toContain("Email:      (none given)");
    expect(message.text).not.toContain("null");
    expect(message.text).toContain("Submitted from the Google lead form.");
    expect(message.text).not.toContain("google_form");
  });

  it("labels a Google lead form lead's address line ZIP, since it is only a ZIP", async () => {
    await sendLeadNotification({ ...input, email: null, source: "google_form", address: "89052" }, "abc");
    const text = send.mock.calls[0][0].text;
    expect(text).toContain("ZIP:        89052");
    expect(text).not.toContain("Address:");
  });

  it("keeps the Address label for a website lead", async () => {
    await sendLeadNotification({ ...input, address: "123 Main St" }, "abc");
    const text = send.mock.calls[0][0].text;
    expect(text).toContain("Address:    123 Main St");
    expect(text).not.toContain("ZIP:");
  });

  it("names the website form a lead came from", async () => {
    await sendLeadNotification(input, "abc");
    expect(send.mock.calls[0][0].text).toContain(`Submitted from the hero form on ${business.domain}.`);
  });

  it("opens with a link straight to the job in the tracker", async () => {
    await sendLeadNotification(input, "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    const lines = send.mock.calls[0][0].text.split("\n");
    expect(lines[0]).toBe("Open in tracker: https://pss.test/admin/jobs/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^Name:\s+Dana Reyes$/);
  });

  it("falls back to the business domain", async () => {
    vi.stubEnv("ADMIN_BASE_URL", "");
    await sendLeadNotification(input, "abc");
    expect(send.mock.calls[0][0].text.split("\n")[0]).toBe(`Open in tracker: ${business.domain}/admin/jobs/abc`);
  });

  it("sends to every owner in a comma-separated list", async () => {
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", " owner@example.com, partner@example.com ,");
    await sendLeadNotification(input, "abc");
    expect(send.mock.calls[0][0].to).toEqual(["owner@example.com", "partner@example.com"]);
  });

  it("names a booking lead's treatment on the Interested line", async () => {
    await sendLeadNotification({ ...input, source: "booking", treatments: ["Shutters"] }, "abc");
    const lines = send.mock.calls[0][0].text.split("\n");
    expect(lines).toContain("Interested: Shutters");
  });

  it("refuses to send when no owner address is configured", async () => {
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", " , ");
    await expect(sendLeadNotification(input, "abc")).rejects.toThrow(/not configured/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("ownerRecipients", () => {
  it("splits and trims the owner list", async () => {
    const { ownerRecipients } = await import("@/lib/leads/email");
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", " a@example.com, b@example.com ,");
    expect(ownerRecipients()).toEqual(["a@example.com", "b@example.com"]);
  });
});

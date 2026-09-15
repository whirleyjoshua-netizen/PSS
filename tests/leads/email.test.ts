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
    expect(text).toMatch(/one business day/i);
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

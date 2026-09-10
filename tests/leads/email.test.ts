import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendCustomerConfirmation } = await import("@/lib/leads/email");
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

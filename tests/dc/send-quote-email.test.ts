import { beforeEach, describe, expect, it, vi } from "vitest";
import { business } from "@/content/business";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const login = { issueCustomerLink: vi.fn(), INVITE_MINUTES: 7 * 24 * 60 };
vi.mock("@/lib/portal/login", () => login);
const { sendQuoteEmail } = await import("@/lib/dc/send-quote-email");

const LINK = "https://pss.test/project/auth?token=abc";
const job = { id: "11111111-1111-4111-8111-111111111111", name: "  Test Testt", email: "  T@Example.COM " } as never;

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  login.issueCustomerLink.mockReset().mockResolvedValue(LINK);
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("sendQuoteEmail", () => {
  it("sends the sign-in link and the quote's name, with no price in it", async () => {
    await sendQuoteEmail(job, "Quote PSS-1042 v1.pdf");
    expect(login.issueCustomerLink).toHaveBeenCalledWith("t@example.com", login.INVITE_MINUTES);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("t@example.com");
    expect(message.subject).toBe(`Your ${business.name} quote is ready`);
    expect(message.replyTo).toBe(business.email);
    expect(message.text).toMatch(/^Hi Test,/);
    expect(message.text).toContain("Quote PSS-1042 v1.pdf");
    expect(message.text).toContain("approve it on your project page");
    expect(message.text).toContain(LINK);
    expect(message.text).not.toContain("$");
  });
  it("throws without a key, without an email, and when Resend rejects it", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendQuoteEmail(job, "q.pdf")).rejects.toThrow("RESEND_API_KEY is not set");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    await expect(sendQuoteEmail({ ...(job as object), email: " " } as never, "q.pdf")).rejects.toThrow("This job has no email address");
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendQuoteEmail(job, "q.pdf")).rejects.toThrow("Resend rejected the quote email: domain not verified");
  });
});

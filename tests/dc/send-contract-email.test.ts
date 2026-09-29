import { beforeEach, describe, expect, it, vi } from "vitest";
import { business } from "@/content/business";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const login = { issueCustomerLink: vi.fn(), INVITE_MINUTES: 7 * 24 * 60 };
vi.mock("@/lib/portal/login", () => login);
const { sendContractEmail } = await import("@/lib/dc/send-contract-email");

const LINK = "https://pss.test/project/sign-in?token=abc";
const job = { id: "11111111-1111-4111-8111-111111111111", name: "  Test Testt", email: "  T@Example.COM " } as never;

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  login.issueCustomerLink.mockReset().mockResolvedValue(LINK);
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("sendContractEmail", () => {
  it("sends the sign-in link and file name to the job's normalised email, with no price in it", async () => {
    await sendContractEmail(job, "Contract PSS-1042 v1.pdf");
    expect(login.issueCustomerLink).toHaveBeenCalledWith("t@example.com", login.INVITE_MINUTES);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("t@example.com");
    expect(message.subject).toBe(`Your ${business.name} proposal is ready to sign`);
    expect(message.subject).toBe("Your Premier Shade Solutions proposal is ready to sign");
    expect(message.replyTo).toBe(business.email);
    expect(message.text).toContain(LINK);
    expect(message.text).toContain("Contract PSS-1042 v1.pdf");
    expect(message.text).toMatch(/^Hi Test,/);
    expect(message.text).not.toContain("$");
  });
  it("throws without a Resend key, and sends nothing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendContractEmail(job, "c.pdf")).rejects.toThrow("RESEND_API_KEY is not set");
    expect(send).not.toHaveBeenCalled();
  });
  it("throws for a job with no email, and issues no link", async () => {
    await expect(sendContractEmail({ ...(job as object), email: "  " } as never, "c.pdf")).rejects.toThrow("This job has no email address");
    expect(login.issueCustomerLink).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("throws when Resend rejects the email", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendContractEmail(job, "c.pdf")).rejects.toThrow("Resend rejected the contract email: domain not verified");
  });
});

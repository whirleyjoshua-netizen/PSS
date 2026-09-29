import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { business } from "@/content/business";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const login = { issueCustomerLink: vi.fn(), INVITE_MINUTES: 7 * 24 * 60 };
vi.mock("@/lib/portal/login", () => login);
const leads = { ownerRecipients: vi.fn() };
vi.mock("@/lib/leads/email", () => leads);
vi.mock("@/lib/admin/origin", () => ({ adminOrigin: () => "https://pss.test" }));
const { notifyOwnersOfDocumentAcknowledgement, sendDocumentEmail } = await import("@/lib/docs/emails");

const LINK = "https://pss.test/project/auth?token=abc";
const job = { id: "11111111-1111-4111-8111-111111111111", name: "  Maria Lopez", email: " Maria@Example.COM ", projectNo: 1048 };

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  login.issueCustomerLink.mockReset().mockResolvedValue(LINK);
  leads.ownerRecipients.mockReset().mockReturnValue(["owner@example.com"]);
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

afterEach(() => vi.unstubAllEnvs());

describe("sendDocumentEmail", () => {
  it("asks the client to sign a sign document, with a sign-in link", async () => {
    await sendDocumentEmail(job, "Change order — PSS-1048", "sign");
    expect(login.issueCustomerLink).toHaveBeenCalledWith("maria@example.com", login.INVITE_MINUTES);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("maria@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.subject).toBe("Your Change order — PSS-1048 is ready to sign");
    expect(message.text).toMatch(/^Hi Maria,/);
    expect(message.text).toContain("You can sign it on your project page:");
    expect(message.text).toContain(LINK);
  });
  it("asks the client to review an acknowledge or view document", async () => {
    await sendDocumentEmail(job, "Service agreement", "acknowledge");
    await sendDocumentEmail(job, "Care notes", "view");
    expect(send.mock.calls.map((c) => c[0].subject)).toEqual(["Your Service agreement is ready to review", "Your Care notes is ready to review"]);
  });
  it("throws without a key or an email, sending nothing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendDocumentEmail(job, "t", "view")).rejects.toThrow("RESEND_API_KEY is not set");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    await expect(sendDocumentEmail({ ...job, email: " " }, "t", "view")).rejects.toThrow("This job has no email address");
    expect(send).not.toHaveBeenCalled();
  });
  it("throws when Resend rejects it", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendDocumentEmail(job, "t", "view")).rejects.toThrow("Resend rejected the document email: domain not verified");
  });
});

describe("notifyOwnersOfDocumentAcknowledgement", () => {
  it("tells the owners who, what, when and where, replying to the client", async () => {
    await notifyOwnersOfDocumentAcknowledgement(job, "Service agreement — PSS-1048", "maria@example.com", new Date("2026-09-28T19:05:00Z"));
    const message = send.mock.calls[0][0];
    expect(message.to).toEqual(["owner@example.com"]);
    expect(message.replyTo).toBe("maria@example.com");
    expect(message.subject).toBe("Document acknowledged: Service agreement — PSS-1048");
    expect(message.text).toContain("Acknowledged by: maria@example.com");
    expect(message.text).toContain("When:            Sep 28, 2026 at 12:05");
    expect(message.text).toContain("Open in tracker: https://pss.test/admin/jobs/11111111-1111-4111-8111-111111111111");
    expect(message.text).toMatch(/^Maria Lopez acknowledged a document/);
    expect(message.text).toContain("Project:         PSS-1048");
  });
  it("says \"The client\" when the job has no name", async () => {
    await notifyOwnersOfDocumentAcknowledgement({ ...job, name: "   " }, "Service agreement", "maria@example.com", new Date());
    expect(send.mock.calls[0][0].text).toMatch(/^The client acknowledged a document from their project page\./);
  });
  it("throws when not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(notifyOwnersOfDocumentAcknowledgement(job, "t", "a@b.c", new Date())).rejects.toThrow("Acknowledgement notification email is not configured");
    expect(send).not.toHaveBeenCalled();
  });
  it("throws when there are no owner recipients, sending nothing", async () => {
    leads.ownerRecipients.mockReturnValue([]);
    await expect(notifyOwnersOfDocumentAcknowledgement(job, "t", "a@b.c", new Date())).rejects.toThrow("Acknowledgement notification email is not configured");
    expect(send).not.toHaveBeenCalled();
  });
});

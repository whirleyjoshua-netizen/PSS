import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The notification the owners act on. They order materials against it, so the four facts it
 * carries — who approved, which document, when, and where to open the job — are what this
 * pins. Resend is mocked away: nothing here may send a real email.
 */
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["a@example.com", "b@example.com"] }));
vi.mock("@/lib/admin/origin", () => ({ adminOrigin: () => "https://admin.example.com" }));

const { notifyOwnersOfApproval } = await import("@/lib/portal/send-approval-email");

const JOB = { id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "John Ramos", projectNo: 1048 };
const QUOTE_NAME = "Quote - Living room.pdf";
const EMAIL = "john@example.com";

/** 2:05 PM in Las Vegas on Thursday, September 17 2026. */
const NOW = new Date("2026-09-17T21:05:00Z");

const body = () => (send.mock.calls[0][0] as { text: string }).text;
const whenLine = () => body().split("\n").find((line) => line.startsWith("When:"))!;

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(NOW);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notifyOwnersOfApproval", () => {
  /**
   * The load-bearing one. A date alone cannot tell an owner reading this at 6pm whether the
   * approval landed before or after the other things they did that day, and the email is the
   * copy they actually read — the precise instant in job_events is not in front of them.
   */
  it("says when the approval landed, to the minute and not only the day", async () => {
    await notifyOwnersOfApproval(JOB, QUOTE_NAME, EMAIL);
    expect(whenLine()).toContain("Sep 17, 2026");
    // The half a date-only formatter cannot produce.
    expect(whenLine()).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    expect(whenLine()).toContain("2:05 PM");
  });

  it("names who approved and which document, and links the job", async () => {
    await notifyOwnersOfApproval(JOB, QUOTE_NAME, EMAIL);
    expect(body()).toContain(`Approved by: ${EMAIL}`);
    expect(body()).toContain(QUOTE_NAME);
    expect(body()).toContain(`https://admin.example.com/admin/jobs/${JOB.id}`);
    expect(body()).toContain("PSS-1048");
  });

  it("reaches both owners and replies to the customer who approved", async () => {
    await notifyOwnersOfApproval(JOB, QUOTE_NAME, EMAIL);
    const sent = send.mock.calls[0][0] as { to: string[]; replyTo: string; subject: string };
    expect(sent.to).toEqual(["a@example.com", "b@example.com"]);
    expect(sent.replyTo).toBe(EMAIL);
    expect(sent.subject).toContain("John Ramos");
  });

  // Resend reports failures in the response body rather than by throwing, so a rejected send
  // that was not read back would look like a delivered email.
  it("raises a send Resend refused", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(notifyOwnersOfApproval(JOB, QUOTE_NAME, EMAIL)).rejects.toThrow("domain not verified");
  });
});

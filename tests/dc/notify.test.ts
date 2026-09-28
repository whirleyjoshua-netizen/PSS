import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));
const { importEmail, notifyOwners } = await import("@/lib/dc/notify");

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("ADMIN_BASE_URL", "https://admin.example.com");
  vi.stubEnv("RESEND_API_KEY", "re_test");
});

describe("importEmail", () => {
  it("an import names the job and the version, and links to its Quote tab", () => {
    const email = importEmail({ outcome: "imported", dcQuoteNo: "22250749", projectNo: "PSS-1042", jobId: "j1", version: 2, detail: null });
    expect(email?.subject).toBe("PSS-1042: quote v2 ready to review");
    expect(email?.text).toContain("DC quote 22250749 arrived for PSS-1042 as version 2.");
    expect(email?.text).toContain("https://admin.example.com/admin/jobs/j1?tab=quote");
  });
  it("a no-match tells the owner how to fix the PO Reference and send again", () => {
    const email = importEmail({ outcome: "no-match", dcQuoteNo: "22250749", projectNo: null, jobId: null, detail: "PSS-9999" });
    expect(email?.subject).toBe("DC quote 22250749 could not be matched to a job");
    expect(email?.text).toContain("(PSS-9999)");
    expect(email?.text).toContain("Reports → Dealer Copy → Email");
    expect(email?.text).not.toContain("/admin/jobs/");
  });
  it("says nothing for unchanged or failed", () => {
    expect(importEmail({ outcome: "unchanged", dcQuoteNo: null, projectNo: null, jobId: null, detail: null })).toBeNull();
    expect(importEmail({ outcome: "failed", dcQuoteNo: null, projectNo: null, jobId: null, detail: null })).toBeNull();
  });
});

describe("notifyOwners", () => {
  it("sends plain text to the owners", async () => {
    await notifyOwners({ subject: "s", text: "t" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["owner@example.com"], subject: "s", text: "t" }));
  });
  it("throws when Resend is not configured, rather than dropping the email", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(notifyOwners({ subject: "s", text: "t" })).rejects.toThrow("not configured");
    expect(send).not.toHaveBeenCalled();
  });
  it("throws when Resend rejects it", async () => {
    send.mockResolvedValue({ error: { message: "bad from" } });
    await expect(notifyOwners({ subject: "s", text: "t" })).rejects.toThrow("bad from");
  });
});

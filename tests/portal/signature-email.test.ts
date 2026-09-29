import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));

import { STAMP_REASONS, notifyOwnersOfSignature, sendCustomerSignedCopy } from "@/lib/portal/send-signature-email";

const job = { id: "11111111-1111-4111-8111-111111111111", name: "Jane Doe", projectNo: 1012 };
const AT = new Date("2026-09-18T17:00:00Z");

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  process.env.RESEND_API_KEY = "test-key";
});

describe("notifyOwnersOfSignature", () => {
  it("says who signed and which document", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", true, AT);
    const text = send.mock.calls[0][0].text as string;
    expect(text).toContain("jane@example.com");
    expect(text).toContain("Contract.pdf");
    expect(text).not.toContain("could not be produced");
    expect(text).not.toContain(STAMP_REASONS);
  });

  it("keeps the contract wording for a quote contract", async () => {
    await notifyOwnersOfSignature(job, "Contract PSS-1012 v1.pdf", "jane@example.com", true, AT, null);
    const email = send.mock.calls[0][0];
    expect(email.subject).toBe("Contract signed: Contract PSS-1012 v1.pdf — PSS-1012");
    expect(email.text).toContain("Jane Doe signed their contract from their project page.");
    expect(email.text).toContain("Document:    Contract PSS-1012 v1.pdf");
  });

  it("words a job document as a document and names it by its title", async () => {
    await notifyOwnersOfSignature(job, "Change order — PSS-1012.pdf", "jane@example.com", true, AT, "Change order — PSS-1012");
    const email = send.mock.calls[0][0];
    expect(email.subject).toBe("Document signed: Change order — PSS-1012");
    expect(email.text).toContain("Jane Doe signed a document from their project page.");
    expect(email.text).toMatch(/^Document: {4}Change order — PSS-1012$/m);
    expect(email.text).not.toMatch(/contract/i);
  });

  // The owners must not believe a stamped copy exists when it does not.
  it("says plainly when the stamped copy could not be produced", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", false, AT);
    expect(send.mock.calls[0][0].text as string).toContain("could not be produced");
  });

  // The time on record, not the moment the email happened to go out.
  it("shows the saved signing time, not the send time", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", true, new Date("2026-03-02T17:05:00Z"));
    // 17:05 UTC on 2 March is 9:05 AM in Las Vegas (PST).
    expect(send.mock.calls[0][0].text as string).toMatch(/When: +Mar 2, 2026 at 9:05 AM/);
  });

  it("names both reasons the stamped copy can fail", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", false, AT);
    const text = send.mock.calls[0][0].text as string;
    expect(text).toContain("protected or damaged");
    expect(text).toContain("characters the PDF font cannot draw");
    expect(text).toContain("recorded and valid");
  });
});

describe("sendCustomerSignedCopy", () => {
  it("attaches the signed PDF", async () => {
    await sendCustomerSignedCopy("jane@example.com", job, "Contract.pdf", Buffer.from("pdf"));
    const attachments = send.mock.calls[0][0].attachments as { filename: string }[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("Contract (signed).pdf");
  });

  // No attachment is better than a broken one, and the page still has the record.
  it("sends without an attachment when there is no stamped copy", async () => {
    await sendCustomerSignedCopy("jane@example.com", job, "Contract.pdf", null);
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
    expect(send.mock.calls[0][0].text as string).toContain("your project page");
  });
});

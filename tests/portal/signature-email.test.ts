import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));

import { notifyOwnersOfSignature, sendCustomerSignedCopy } from "@/lib/portal/send-signature-email";

const job = { id: "11111111-1111-4111-8111-111111111111", name: "Jane Doe", projectNo: 1012 };

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  process.env.RESEND_API_KEY = "test-key";
});

describe("notifyOwnersOfSignature", () => {
  it("says who signed and which document", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", true);
    const text = send.mock.calls[0][0].text as string;
    expect(text).toContain("jane@example.com");
    expect(text).toContain("Contract.pdf");
  });

  // The owners must not believe a stamped copy exists when it does not.
  it("says plainly when the stamped copy could not be produced", async () => {
    await notifyOwnersOfSignature(job, "Contract.pdf", "jane@example.com", false);
    expect(send.mock.calls[0][0].text as string).toContain("could not be produced");
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

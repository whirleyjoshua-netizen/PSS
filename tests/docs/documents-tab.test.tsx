import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listJobDocuments = vi.fn();
vi.mock("@/lib/docs/job-documents", () => ({ listJobDocuments }));
const listTemplates = vi.fn();
vi.mock("@/lib/docs/templates", () => ({ listTemplates }));
const sendDocumentAction = vi.fn(async (): Promise<Record<string, unknown>> => ({}));
vi.mock("@/app/admin/jobs/[id]/document-actions", () => ({
  createDocumentAction: vi.fn(async () => ({})), saveDocumentAction: vi.fn(async () => ({})),
  sendDocumentAction, voidDocumentAction: vi.fn(async () => ({})), discardDocumentAction: vi.fn(async () => ({})),
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

const { DocumentsTab, documentStatusLabel, parseSentNotice } = await import("@/app/admin/jobs/[id]/DocumentsTab");

const JOB = "11111111-1111-4111-8111-111111111111";
const job = { id: JOB, email: "maria@example.com", status: "sold" } as never;
const doc = (over: Record<string, unknown>) => ({ id: "d1", leadId: JOB, templateId: null, title: "Service agreement — PSS-1048", kind: "service_agreement",
  response: "acknowledge", body: "Deposit {{deposit}}", status: "draft", fileId: null, sentAt: null, sentBy: null, completedAt: null, voidedAt: null,
  createdBy: "o", createdAt: new Date(), updatedAt: new Date(), ...over });

beforeEach(() => {
  listJobDocuments.mockReset().mockResolvedValue([]);
  listTemplates.mockReset().mockResolvedValue([{ id: "t1", name: "Service agreement", kind: "service_agreement" }, { id: "t2", name: "Terms", kind: "terms" }]);
});

describe("documentStatusLabel", () => {
  const sentAt = new Date("2026-09-28T18:00:00Z");
  const completedAt = new Date("2026-09-29T18:00:00Z");
  it("names every status, with its date", () => {
    expect(documentStatusLabel({ status: "draft", response: "sign", sentAt: null, completedAt: null })).toBe("Draft");
    expect(documentStatusLabel({ status: "sent", response: "sign", sentAt, completedAt: null })).toBe("Sent Sep 28, 2026");
    expect(documentStatusLabel({ status: "completed", response: "sign", sentAt, completedAt })).toBe("Signed Sep 29, 2026");
    expect(documentStatusLabel({ status: "completed", response: "acknowledge", sentAt, completedAt })).toBe("Acknowledged Sep 29, 2026");
    expect(documentStatusLabel({ status: "completed", response: "view", sentAt, completedAt: sentAt })).toBe("Sent Sep 28, 2026");
    expect(documentStatusLabel({ status: "void", response: "sign", sentAt, completedAt: null })).toBe("Void");
  });
  it("reads only the two known send notices", () => {
    expect(parseSentNotice("1")).toBe("1");
    expect(parseSentNotice(["email-failed"])).toBe("email-failed");
    expect(parseSentNotice("<b>hi</b>")).toBeNull();
  });
});

describe("DocumentsTab", () => {
  it("offers only client-document templates", async () => {
    render(await DocumentsTab({ job, selectedId: null, sentNotice: null }));
    const options = [...(screen.getByLabelText("Template") as HTMLSelectElement).options].map((o) => o.textContent);
    expect(options).toEqual(["Service agreement (Service agreement)"]);
    expect(screen.getByRole("button", { name: "Create document" })).toBeInTheDocument();
  });
  it("lists documents with status, PDF and Void only while sent", async () => {
    listJobDocuments.mockResolvedValue([
      doc({ id: "d1", status: "sent", fileId: "f1", sentAt: new Date("2026-09-28T18:00:00Z"), title: "A" }),
      doc({ id: "d2", status: "completed", fileId: "f2", sentAt: new Date(), completedAt: new Date("2026-09-29T18:00:00Z"), title: "B" }),
    ]);
    render(await DocumentsTab({ job, selectedId: null, sentNotice: null }));
    const rows = within(screen.getByRole("list", { name: "Documents on this job" })).getAllByRole("listitem");
    expect(within(rows[0]).getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/admin/files/f1");
    expect(within(rows[0]).getByRole("button", { name: "Void A" })).toBeInTheDocument();
    expect(within(rows[1]).getByText("Acknowledged Sep 29, 2026")).toBeInTheDocument();
    expect(within(rows[1]).queryByRole("button")).toBeNull();
  });
  it("opens a selected draft with its blockers, Send disabled", async () => {
    listJobDocuments.mockResolvedValue([doc({})]);
    render(await DocumentsTab({ job, selectedId: "d1", sentNotice: null }));
    const panel = screen.getByRole("region", { name: "Draft: Service agreement — PSS-1048" });
    expect(within(panel).getByRole("list", { name: "Before you can send" })).toHaveTextContent("Fill in {{deposit}} first.");
    expect(within(panel).getByRole("button", { name: "Send to client" })).toBeDisabled();
  });
  it("disables Send while there are unsaved changes", async () => {
    listJobDocuments.mockResolvedValue([doc({ body: "Deposit $500" })]);
    render(await DocumentsTab({ job, selectedId: "d1", sentNotice: null }));
    const panel = screen.getByRole("region", { name: "Draft: Service agreement — PSS-1048" });
    expect(within(panel).getByRole("button", { name: "Send to client" })).toBeEnabled();
    fireEvent.change(within(panel).getByLabelText("Text"), { target: { value: "Deposit $600" } });
    expect(within(panel).getByRole("button", { name: "Send to client" })).toBeDisabled();
    expect(within(panel).getByText("Save your changes before sending.")).toBeInTheDocument();
  });
  it("after a send whose email failed, opens the tab on the email-failed notice", async () => {
    replace.mockReset();
    sendDocumentAction.mockResolvedValueOnce({ ok: true, emailed: false });
    listJobDocuments.mockResolvedValue([doc({ body: "Deposit $500" })]);
    render(await DocumentsTab({ job, selectedId: "d1", sentNotice: null }));
    fireEvent.click(screen.getByRole("button", { name: "Send to client" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/admin/jobs/${JOB}?tab=documents&sent=email-failed`));
  });
  it("shows a refused send in the panel and stays on the draft", async () => {
    replace.mockReset();
    sendDocumentAction.mockResolvedValueOnce({ error: "This document changed while you were sending. Reload and try again." });
    listJobDocuments.mockResolvedValue([doc({ body: "Deposit $500" })]);
    render(await DocumentsTab({ job, selectedId: "d1", sentNotice: null }));
    fireEvent.click(screen.getByRole("button", { name: "Send to client" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This document changed while you were sending. Reload and try again.");
    expect(replace).not.toHaveBeenCalled();
  });
  it("shows the fixed copy for a send notice", async () => {
    render(await DocumentsTab({ job, selectedId: null, sentNotice: "email-failed" }));
    expect(screen.getByRole("status")).toHaveTextContent("Sent, but the email to the client failed — send them their project page link yourself.");
  });
  it("points to the Documents page when there is no client template", async () => {
    listTemplates.mockResolvedValue([]);
    render(await DocumentsTab({ job, selectedId: null, sentNotice: null }));
    expect(screen.getByRole("link", { name: "Write one on the Documents page" })).toHaveAttribute("href", "/admin/documents/new");
  });
});

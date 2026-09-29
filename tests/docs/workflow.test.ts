import { beforeEach, describe, expect, it, vi } from "vitest";

const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const store = { getJobDocument: vi.fn(), insertDraft: vi.fn(), markSent: vi.fn() };
vi.mock("@/lib/docs/job-documents", () => store);
const templates = { getTemplate: vi.fn() };
vi.mock("@/lib/docs/templates", () => templates);
const pdf = { buildDocumentPdf: vi.fn() };
vi.mock("@/lib/docs/pdf", () => pdf);
const emails = { sendDocumentEmail: vi.fn() };
vi.mock("@/lib/docs/emails", () => emails);

const { SEND_RACE, createDocumentFromTemplate, documentSendBlockers, sendJobDocument } = await import("@/lib/docs/workflow");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const TEMPLATE = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-09-28T19:00:00Z");
const job = { id: JOB, name: "Maria Lopez", email: "maria@example.com", phone: "7025550100", address: "12 Palm Way", city: "Henderson",
  status: "sold", projectNo: 1048, soldCents: 450000, quoteCents: null, depositCents: null, installOn: null };
const template = { id: TEMPLATE, name: "Service agreement", kind: "service_agreement", response: "acknowledge", archivedAt: null,
  body: "## Scope\n\nHi {{client_first_name}}. Deposit {{deposit}}." };
const draft = { id: DOC, leadId: JOB, title: "Service agreement — PSS-1048", status: "draft", response: "acknowledge", body: "## Scope\n\nHi Maria. Deposit $500." };

beforeEach(() => {
  for (const f of [...Object.values(files), ...Object.values(jobs), ...Object.values(store), ...Object.values(templates),
    ...Object.values(pdf), ...Object.values(emails)]) f.mockReset();
  jobs.getJob.mockResolvedValue(job);
  templates.getTemplate.mockResolvedValue(template);
  store.insertDraft.mockResolvedValue(DOC);
  store.getJobDocument.mockResolvedValue(draft);
  store.markSent.mockResolvedValue(true);
  pdf.buildDocumentPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  files.createFile.mockResolvedValue({ id: FILE });
  files.deleteFile.mockResolvedValue(true);
  emails.sendDocumentEmail.mockResolvedValue(undefined);
});

describe("documentSendBlockers", () => {
  const ok = { status: "draft" as const, title: "T", body: "Text" };
  const client = { email: "a@b.c", status: "sold" as const };
  it("has none for a finished draft on a live job with an email", () => expect(documentSendBlockers(ok, client)).toEqual([]));
  it("names every reason plainly", () => {
    expect(documentSendBlockers({ status: "sent", title: " ", body: "{{deposit}} and {{x}}" }, { email: "  ", status: "lost" })).toEqual([
      "This document has already been sent.", "Give the document a title.", "Fill in {{deposit}}, {{x}} first.",
      "Add the client's email to the job first.", "This job is marked Lost.",
    ]);
    expect(documentSendBlockers({ ...ok, body: " " }, { email: null, status: "sold" })).toEqual(["The document is empty.", "Add the client's email to the job first."]);
  });
});

describe("createDocumentFromTemplate", () => {
  it("fills the fields, leaves a missing one as a marker, and titles it with the PSS number", async () => {
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o@x.com", now: NOW })).toEqual({ id: DOC });
    expect(store.insertDraft).toHaveBeenCalledWith({ leadId: JOB, templateId: TEMPLATE, title: "Service agreement — PSS-1048",
      kind: "service_agreement", response: "acknowledge", body: "## Scope\n\nHi Maria. Deposit {{deposit}}.", actor: "o@x.com" });
  });
  it("refuses an archived template, a terms or guide template, and a missing job", async () => {
    templates.getTemplate.mockResolvedValueOnce({ ...template, archivedAt: new Date() });
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" })).toEqual({ error: "That template is no longer available. Reload the page." });
    templates.getTemplate.mockResolvedValueOnce({ ...template, kind: "terms" });
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" })).toEqual({ error: "That template is no longer available. Reload the page." });
    jobs.getJob.mockResolvedValueOnce(null);
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" })).toEqual({ error: "This job no longer exists." });
    expect(store.insertDraft).not.toHaveBeenCalled();
  });
  it("rejects a template with an unknown field", async () => {
    templates.getTemplate.mockResolvedValueOnce({ ...template, body: "Hi {{nope}}" });
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" }))
      .toEqual({ error: "The template uses fields that don't exist ({{nope}}). Fix it on the Documents page." });
    expect(store.insertDraft).not.toHaveBeenCalled();
  });
  it("refuses plainly when the store writes nothing (the job or template went away meanwhile)", async () => {
    store.insertDraft.mockResolvedValueOnce(null);
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" }))
      .toEqual({ error: "This job or template no longer exists. Reload the page." });
  });
  it("never hands the store a blank title", async () => {
    jobs.getJob.mockResolvedValueOnce({ ...job, projectNo: null });
    templates.getTemplate.mockResolvedValueOnce({ ...template, name: " " });
    expect(await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" }))
      .toEqual({ error: "Give the template a name on the Documents page." });
    expect(store.insertDraft).not.toHaveBeenCalled();
  });
  it("titles it with the template name alone when the job has no PSS number", async () => {
    jobs.getJob.mockResolvedValueOnce({ ...job, projectNo: null });
    await createDocumentFromTemplate({ jobId: JOB, templateId: TEMPLATE, actor: "o" });
    expect(store.insertDraft.mock.calls[0][0].title).toBe("Service agreement");
  });
});

describe("sendJobDocument", () => {
  it("renders the stored text, stores the PDF, sends in one statement, then emails", async () => {
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o@x.com", now: NOW })).toEqual({ ok: true, emailed: true });
    const [input] = pdf.buildDocumentPdf.mock.calls[0];
    expect(input).toMatchObject({ title: draft.title, projectNo: "PSS-1048", date: NOW, response: "acknowledge",
      client: { name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "maria@example.com" } });
    expect(input.blocks[0]).toEqual({ type: "heading", level: 2, inlines: [{ type: "text", text: "Scope", bold: false }] });
    expect(files.createFile).toHaveBeenCalledWith(expect.objectContaining({ leadId: JOB, kind: "document", name: `${draft.title}.pdf`,
      contentType: "application/pdf", actor: "o@x.com", docType: "other" }));
    expect(store.markSent).toHaveBeenCalledWith({ leadId: JOB, documentId: DOC, fileId: FILE, title: draft.title, body: draft.body, actor: "o@x.com" });
    expect(emails.sendDocumentEmail).toHaveBeenCalledWith(job, draft.title, "acknowledge");
  });
  it("stores a sign document as a contract, so the signing path offers it", async () => {
    store.getJobDocument.mockResolvedValue({ ...draft, response: "sign" });
    await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" });
    expect(files.createFile.mock.calls[0][0].docType).toBe("contract");
  });
  it("refuses with the first blocker and stores nothing", async () => {
    store.getJobDocument.mockResolvedValue({ ...draft, body: "Deposit {{deposit}}" });
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: "Fill in {{deposit}} first." });
    expect(files.createFile).not.toHaveBeenCalled();
  });
  it("removes the PDF and answers the race when the statement matched nothing", async () => {
    store.markSent.mockResolvedValue(false);
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: SEND_RACE });
    expect(files.deleteFile).toHaveBeenCalledWith(FILE, "o");
    expect(emails.sendDocumentEmail).not.toHaveBeenCalled();
  });
  it("removes the PDF when the statement throws, and the error still propagates", async () => {
    store.markSent.mockRejectedValue(new Error("db down"));
    await expect(sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).rejects.toThrow("db down");
    expect(files.deleteFile).toHaveBeenCalledWith(FILE, "o");
  });
  it("a failed email leaves the document sent, and says so", async () => {
    emails.sendDocumentEmail.mockRejectedValue(new Error("resend"));
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ ok: true, emailed: false });
  });
  it("answers plainly for a missing job or document", async () => {
    store.getJobDocument.mockResolvedValueOnce(null);
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: "This document no longer exists." });
    jobs.getJob.mockResolvedValueOnce(null);
    expect(await sendJobDocument({ jobId: JOB, documentId: DOC, actor: "o" })).toEqual({ error: "This job no longer exists." });
  });
});

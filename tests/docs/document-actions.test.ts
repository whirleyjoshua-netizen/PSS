import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => { order.push("auth"); return { email: "owner@example.com" }; });
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("@/lib/admin/jobs", () => ({ isUuid: (id: string) => /^[0-9a-f-]{36}$/.test(id) }));
const workflow = { createDocumentFromTemplate: vi.fn(), sendJobDocument: vi.fn(), TITLE_MAX: 200 };
vi.mock("@/lib/docs/workflow", () => workflow);
const store = { updateDraft: vi.fn(), discardDraft: vi.fn(), voidDocument: vi.fn() };
vi.mock("@/lib/docs/job-documents", () => store);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const actions = await import("@/app/admin/jobs/[id]/document-actions");

const JOB = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "33333333-3333-4333-8333-333333333333";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};

beforeEach(() => {
  order.length = 0;
  for (const f of [...Object.values(store), workflow.createDocumentFromTemplate, workflow.sendJobDocument, revalidatePath, redirect]) f.mockReset();
  redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
  workflow.createDocumentFromTemplate.mockImplementation(async () => { order.push("create"); return { id: DOC }; });
  workflow.sendJobDocument.mockImplementation(async () => { order.push("send"); return { ok: true, emailed: true }; });
  store.updateDraft.mockImplementation(async () => { order.push("save"); return true; });
  store.voidDocument.mockResolvedValue(true);
  store.discardDraft.mockResolvedValue(true);
});

describe("document actions", () => {
  it("createDocumentAction checks the admin, creates, then opens the draft", async () => {
    await expect(actions.createDocumentAction({}, form({ jobId: JOB, templateId: TEMPLATE })))
      .rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}?tab=documents&doc=${DOC}`);
    expect(order).toEqual(["auth", "create"]);
    expect(workflow.createDocumentFromTemplate).toHaveBeenCalledWith({ jobId: JOB, templateId: TEMPLATE, actor: "owner@example.com" });
  });
  it("createDocumentAction refuses malformed ids and passes a refusal through", async () => {
    expect(await actions.createDocumentAction({}, form({ jobId: JOB, templateId: "x" }))).toEqual({ error: "Choose a template." });
    workflow.createDocumentFromTemplate.mockResolvedValueOnce({ error: "That template is no longer available. Reload the page." });
    expect(await actions.createDocumentAction({}, form({ jobId: JOB, templateId: TEMPLATE })))
      .toEqual({ error: "That template is no longer available. Reload the page." });
  });
  it("saveDocumentAction validates, saves a draft only, and says when it is no longer one", async () => {
    expect(await actions.saveDocumentAction({}, form({ jobId: JOB, documentId: DOC, title: " ", body: "b" }))).toEqual({ error: "Give the document a title." });
    expect(await actions.saveDocumentAction({}, form({ jobId: JOB, documentId: DOC, title: "T", body: "b" }))).toEqual({ saved: true });
    expect(order).toEqual(["auth", "auth", "save"]);
    expect(store.updateDraft).toHaveBeenCalledWith({ leadId: JOB, documentId: DOC, title: "T", body: "b" });
    store.updateDraft.mockResolvedValueOnce(false);
    expect(await actions.saveDocumentAction({}, form({ jobId: JOB, documentId: DOC, title: "T", body: "b" })))
      .toEqual({ error: "This document has been sent and can no longer be changed." });
  });
  it("sendDocumentAction checks the admin first and turns a throw into a plain answer", async () => {
    expect(await actions.sendDocumentAction(JOB, DOC)).toEqual({ ok: true, emailed: true });
    expect(order).toEqual(["auth", "send"]);
    workflow.sendJobDocument.mockRejectedValueOnce(new Error("blob down"));
    expect(await actions.sendDocumentAction(JOB, DOC)).toEqual({ error: "The document could not be sent. Try again, and if it keeps failing, contact support." });
    workflow.sendJobDocument.mockResolvedValueOnce({ error: "Fill in {{deposit}} first." });
    expect(await actions.sendDocumentAction(JOB, DOC)).toEqual({ error: "Fill in {{deposit}} first." });
  });
  it("sendDocumentAction says when the document was sent but the email was not", async () => {
    workflow.sendJobDocument.mockResolvedValueOnce({ ok: true, emailed: false });
    expect(await actions.sendDocumentAction(JOB, DOC)).toEqual({ ok: true, emailed: false });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${JOB}`);
  });
  it("void and discard answer plainly when refused", async () => {
    store.voidDocument.mockResolvedValueOnce(false);
    expect(await actions.voidDocumentAction(JOB, DOC)).toEqual({ error: "Only a sent document that hasn't been signed or acknowledged can be voided." });
    store.discardDraft.mockResolvedValueOnce(false);
    expect(await actions.discardDocumentAction(JOB, DOC)).toEqual({ error: "Only a draft can be discarded." });
    expect(await actions.voidDocumentAction(JOB, DOC)).toEqual({});
    expect(store.voidDocument).toHaveBeenLastCalledWith(JOB, DOC, "owner@example.com");
  });
});

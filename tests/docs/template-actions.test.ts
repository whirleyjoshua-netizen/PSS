import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const requireAdmin = vi.fn(async () => { order.push("auth"); return { email: "owner@example.com" }; });
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { createTemplate: vi.fn(), updateTemplate: vi.fn(), getTemplate: vi.fn(), archiveTemplate: vi.fn() };
vi.mock("@/lib/docs/templates", () => store);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { archiveTemplateAction, createTemplateAction, saveTemplateAction, startStarterTermsAction } = await import("@/app/admin/documents/actions");
const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");

const ID = "11111111-1111-4111-8111-111111111111";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};
const good = { kind: "service_agreement", name: "Service agreement", response: "acknowledge", body: "## Scope\n\nHi {{client_name}}." };

beforeEach(() => {
  order.length = 0;
  for (const f of [...Object.values(store), revalidatePath, redirect]) f.mockClear();
  store.createTemplate.mockReset().mockImplementation(async () => { order.push("create"); return { id: ID }; });
  store.getTemplate.mockReset().mockResolvedValue({ id: ID, kind: "terms", archivedAt: null });
  store.updateTemplate.mockReset().mockResolvedValue(true);
  store.archiveTemplate.mockReset().mockResolvedValue(true);
});

describe("createTemplateAction", () => {
  it("checks the admin first, creates, then opens the template", async () => {
    await expect(createTemplateAction({}, form(good))).rejects.toThrow(`NEXT_REDIRECT /admin/documents/${ID}`);
    expect(order).toEqual(["auth", "create"]);
    expect(store.createTemplate).toHaveBeenCalledWith({ ...good, actor: "owner@example.com" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/documents");
  });
  it("answers every problem and saves nothing", async () => {
    expect(await createTemplateAction({}, form({ ...good, name: " ", body: "{{nope}}" })))
      .toEqual({ errors: ["Give the template a name.", "Unknown field {{nope}}."] });
    expect(store.createTemplate).not.toHaveBeenCalled();
  });
  it("makes terms and guides view-only whatever the form says", async () => {
    await expect(createTemplateAction({}, form({ ...good, kind: "terms", response: "sign", body: "For {{client_name}}" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.createTemplate.mock.calls[0][0].response).toBe("view");
  });
  it("shows the store's refusal of a second live singleton", async () => {
    store.createTemplate.mockResolvedValueOnce({ error: "There is already a live Contract terms template. Edit that one instead." });
    expect(await createTemplateAction({}, form({ ...good, kind: "terms", body: "x" })))
      .toEqual({ errors: ["There is already a live Contract terms template. Edit that one instead."] });
  });
});

describe("saveTemplateAction", () => {
  it("validates against the stored kind and saves", async () => {
    expect(await saveTemplateAction({}, form({ id: ID, name: "Terms", response: "sign", body: "Hi {{client_name}}" }))).toEqual({ saved: true });
    expect(store.updateTemplate).toHaveBeenCalledWith({ id: ID, name: "Terms", response: "view", body: "Hi {{client_name}}", actor: "owner@example.com" });
    expect(requireAdmin).toHaveBeenCalled();
  });
  it("refuses a field the stored kind cannot use", async () => {
    expect(await saveTemplateAction({}, form({ id: ID, name: "Terms", response: "view", body: "{{deposit}}" })))
      .toEqual({ errors: ["{{deposit}} can't be used in Contract terms."] });
    expect(store.updateTemplate).not.toHaveBeenCalled();
  });
  it("refuses an archived or missing template", async () => {
    store.getTemplate.mockResolvedValueOnce({ id: ID, kind: "other", archivedAt: new Date() });
    expect(await saveTemplateAction({}, form({ id: ID, name: "x", response: "view", body: "y" }))).toEqual({ errors: ["This template was archived. Reload the page."] });
    store.getTemplate.mockResolvedValueOnce(null);
    expect(await saveTemplateAction({}, form({ id: "nope", name: "x", response: "view", body: "y" }))).toEqual({ errors: ["This template was archived. Reload the page."] });
  });
});

describe("archive and starter", () => {
  it("archives, then returns to the list", async () => {
    await expect(archiveTemplateAction(form({ id: ID }))).rejects.toThrow("NEXT_REDIRECT /admin/documents");
    expect(store.archiveTemplate).toHaveBeenCalledWith(ID, "owner@example.com");
  });
  it("starts the terms from the starter text", async () => {
    await expect(startStarterTermsAction()).rejects.toThrow(`NEXT_REDIRECT /admin/documents/${ID}`);
    expect(order).toEqual(["auth", "create"]);
    expect(store.createTemplate).toHaveBeenCalledWith({ name: "Contract terms", kind: "terms", response: "view", body: STARTER_TERMS, actor: "owner@example.com" });
  });
  it("says so when live terms already exist", async () => {
    store.createTemplate.mockResolvedValueOnce({ error: "exists" });
    await expect(startStarterTermsAction()).rejects.toThrow("NEXT_REDIRECT /admin/documents?starter=exists");
  });
});

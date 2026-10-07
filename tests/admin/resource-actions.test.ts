import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const blob = { head: vi.fn(), del: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const store = {
  createResource: vi.fn(), getResource: vi.fn(), renameResource: vi.fn(), recategorizeResource: vi.fn(), deleteResource: vi.fn(),
  createCategory: vi.fn(), renameCategory: vi.fn(), deleteCategory: vi.fn(),
};
vi.mock("@/lib/admin/resources", () => store);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const actions = await import("@/app/admin/resources/actions");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const PATH = `resources/${ID}/W-9.pdf`;
const OWNER = "owner@example.com";
const saved = { id: ID, name: "W-9.pdf", category: "Licenses", contentType: "application/pdf", sizeBytes: 52341, uploadedBy: OWNER, createdAt: new Date(0) };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: OWNER });
  blob.head.mockResolvedValue({ size: 52341, contentType: "application/pdf", pathname: PATH });
  blob.del.mockResolvedValue(undefined);
  store.createResource.mockResolvedValue(saved);
  store.getResource.mockResolvedValue(null);
  store.renameResource.mockResolvedValue(true);
  store.recategorizeResource.mockResolvedValue(true);
  store.deleteResource.mockResolvedValue(PATH);
  store.createCategory.mockResolvedValue(true);
  store.renameCategory.mockResolvedValue(true);
  store.deleteCategory.mockResolvedValue(true);
});
const pgError = (code: string) => Object.assign(new Error(`pg ${code}`), { code });

describe("saveResourceAction", () => {
  it("records the file with the size and type storage reports, not what the browser claimed", async () => {
    expect(await actions.saveResourceAction({ pathname: PATH, name: "  W-9.pdf ", category: " Licenses " })).toEqual({ ok: true });
    expect(blob.head).toHaveBeenCalledWith(PATH);
    expect(store.createResource).toHaveBeenCalledWith({
      id: ID, name: "W-9.pdf", category: "Licenses", contentType: "application/pdf", sizeBytes: 52341, pathname: PATH, uploadedBy: OWNER,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/resources");
  });

  it("refuses a path that isn't a resources upload, before touching storage", async () => {
    expect(await actions.saveResourceAction({ pathname: `jobs/${ID}/W-9.pdf`, name: "W-9.pdf", category: "Licenses" })).toEqual({ error: "That upload can't be saved." });
    expect(blob.head).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("refuses an empty category and removes the upload", async () => {
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "  " })).toEqual({ error: "Pick a category." });
    expect(blob.del).toHaveBeenCalledWith(PATH);
    expect(store.createResource).not.toHaveBeenCalled();
  });

  it("shortens a long name rather than losing the upload", async () => {
    expect(await actions.saveResourceAction({ pathname: PATH, name: `${"x".repeat(250)}.pdf`, category: "Licenses" })).toEqual({ ok: true });
    expect(store.createResource.mock.calls[0][0].name).toHaveLength(200);
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("never touches the file of an upload that is already saved, whatever else it is sent", async () => {
    store.getResource.mockResolvedValue({ ...saved, pathname: PATH });
    for (const input of [{ name: "W-9.pdf", category: "Licenses" }, { name: "", category: "" }]) {
      expect(await actions.saveResourceAction({ pathname: PATH, ...input })).toEqual({ ok: true });
    }
    expect(blob.del).not.toHaveBeenCalled();
    expect(blob.head).not.toHaveBeenCalled();
    expect(store.createResource).not.toHaveBeenCalled();
  });

  it("refuses and removes an empty file", async () => {
    blob.head.mockResolvedValue({ size: 0, contentType: "application/pdf", pathname: PATH });
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" })).toEqual({ error: "That file is empty." });
    expect(blob.del).toHaveBeenCalledWith(PATH);
    expect(store.createResource).not.toHaveBeenCalled();
  });

  it("says so when the upload never arrived, and clears any part of it", async () => {
    blob.head.mockRejectedValue(new Error("BlobNotFoundError"));
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" })).toEqual({ error: "The upload didn't finish. Try again." });
    expect(store.createResource).not.toHaveBeenCalled();
    expect(blob.del).toHaveBeenCalledWith(PATH);
  });

  it("removes and refuses a file over 200 MB", async () => {
    blob.head.mockResolvedValue({ size: 200 * 1024 * 1024 + 1, contentType: "application/pdf", pathname: PATH });
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" })).toEqual({ error: "Files must be 200 MB or smaller." });
    expect(blob.del).toHaveBeenCalledWith(PATH);
  });

  it("stores an unknown type as a download", async () => {
    blob.head.mockResolvedValue({ size: 10, contentType: "", pathname: PATH });
    await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" });
    expect(store.createResource).toHaveBeenCalledWith(expect.objectContaining({ contentType: "application/octet-stream" }));
  });

  it("a second save of the same upload keeps the file", async () => {
    store.createResource.mockResolvedValue(null);
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" })).toEqual({ ok: true });
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("removes the upload when the row can't be written, and says so", async () => {
    store.createResource.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" })).toEqual({ error: "The file couldn't be saved. Try again." });
    expect(blob.del).toHaveBeenCalledWith(PATH);
  });

  it("keeps the file when the write failed only in reply: the row is there", async () => {
    store.createResource.mockRejectedValue(new Error("fetch failed"));
    store.getResource.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...saved, pathname: PATH });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" })).toEqual({ ok: true });
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("is for signed-in owners only", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Licenses" })).rejects.toThrow("NEXT_REDIRECT");
    expect(blob.head).not.toHaveBeenCalled();
  });
});

describe("rename, move and delete", () => {
  it("renames with a cleaned name, refusing an empty one", async () => {
    expect(await actions.renameResourceAction(ID, "  Form W-9.pdf ")).toEqual({ ok: true });
    expect(store.renameResource).toHaveBeenCalledWith(ID, "Form W-9.pdf");
    expect(await actions.renameResourceAction(ID, "")).toEqual({ error: "Give the file a name (up to 200 characters)." });
  });

  it("moves to a cleaned category, refusing an empty one", async () => {
    expect(await actions.recategorizeResourceAction(ID, " Tax  forms ")).toEqual({ ok: true });
    expect(store.recategorizeResource).toHaveBeenCalledWith(ID, "Tax forms");
    expect(await actions.recategorizeResourceAction(ID, " ")).toEqual({ error: "Pick a category." });
  });

  it("a move into a category deleted meanwhile says so", async () => {
    store.recategorizeResource.mockRejectedValue(pgError("23503"));
    expect(await actions.recategorizeResourceAction(ID, "Tax")).toEqual({ error: "That category was deleted. Pick another." });
  });

  it("says so when the file was already deleted", async () => {
    store.renameResource.mockResolvedValue(false);
    expect(await actions.renameResourceAction(ID, "x")).toEqual({ error: "That file was deleted." });
  });

  it("deletes the row, then the stored file", async () => {
    expect(await actions.deleteResourceAction(ID)).toEqual({ ok: true });
    expect(blob.del).toHaveBeenCalledWith(PATH);
    expect(store.deleteResource.mock.invocationCallOrder[0]).toBeLessThan(blob.del.mock.invocationCallOrder[0]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/resources");
  });

  it("keeps the row deleted even if removing the stored file fails", async () => {
    blob.del.mockRejectedValue(new Error("blob down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await actions.deleteResourceAction(ID)).toEqual({ ok: true });
  });

  it("each requires an owner", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    for (const call of [
      () => actions.renameResourceAction(ID, "x"), () => actions.recategorizeResourceAction(ID, "x"), () => actions.deleteResourceAction(ID),
      () => actions.addCategoryAction("x"), () => actions.renameCategoryAction("x", "y"), () => actions.deleteCategoryAction("x"),
    ]) {
      await expect(call()).rejects.toThrow("NEXT_REDIRECT");
    }
    expect(store.renameResource).not.toHaveBeenCalled();
    expect(store.deleteResource).not.toHaveBeenCalled();
    expect(store.createCategory).not.toHaveBeenCalled();
    expect(store.renameCategory).not.toHaveBeenCalled();
    expect(store.deleteCategory).not.toHaveBeenCalled();
  });
});

describe("categories", () => {
  it("adds a cleaned name, refusing an empty one or one that exists", async () => {
    expect(await actions.addCategoryAction("  Tax   forms ")).toEqual({ ok: true });
    expect(store.createCategory).toHaveBeenCalledWith("Tax forms");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/resources");
    expect(await actions.addCategoryAction(" ")).toEqual({ error: "Give the category a name (up to 60 characters)." });
    store.createCategory.mockResolvedValue(false);
    expect(await actions.addCategoryAction("licenses")).toEqual({ error: "A category named licenses already exists." });
  });

  it("renames to a cleaned name, and says when the name is taken or the category is gone", async () => {
    expect(await actions.renameCategoryAction("Tax", " Taxes ")).toEqual({ ok: true });
    expect(store.renameCategory).toHaveBeenCalledWith("Tax", "Taxes");
    store.renameCategory.mockRejectedValueOnce(pgError("23505"));
    expect(await actions.renameCategoryAction("Tax", "Licenses")).toEqual({ error: "A category named Licenses already exists." });
    store.renameCategory.mockResolvedValueOnce(false);
    expect(await actions.renameCategoryAction("Tax", "Taxes")).toEqual({ error: "That category was deleted." });
  });

  it("deletes a category", async () => {
    expect(await actions.deleteCategoryAction("Tax")).toEqual({ ok: true });
    expect(store.deleteCategory).toHaveBeenCalledWith("Tax");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/resources");
  });

  it("never renames or deletes Uncategorized", async () => {
    const refused = { error: "Uncategorized can't be renamed or deleted." };
    expect(await actions.renameCategoryAction("Uncategorized", "Misc")).toEqual(refused);
    expect(await actions.deleteCategoryAction("Uncategorized")).toEqual(refused);
    expect(store.renameCategory).not.toHaveBeenCalled();
    expect(store.deleteCategory).not.toHaveBeenCalled();
  });

  it("an upload into a category deleted meanwhile is removed and says so", async () => {
    store.createResource.mockRejectedValue(pgError("23503"));
    expect(await actions.saveResourceAction({ pathname: PATH, name: "W-9.pdf", category: "Tax" })).toEqual({ error: "That category was deleted. Pick another." });
    expect(blob.del).toHaveBeenCalledWith(PATH);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { addTaskUpload: vi.fn(), getTaskFile: vi.fn(), linkResource: vi.fn(), recordedPathnames: vi.fn(), removeTaskFile: vi.fn() };
vi.mock("@/lib/admin/task-files", () => store);
const uploads = { verifyTaskUpload: vi.fn(), discardUpload: vi.fn() };
vi.mock("@/lib/admin/task-file-uploads", () => uploads);
const blob = { del: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const actions = await import("@/app/admin/tasks/file-actions");

const TASK = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const RES = "5c4b3a29-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const PATH = `task-files/${TASK}/${FILE}/Headlines.pdf`;
const pending = { pathname: PATH, name: "Headlines.pdf" };
const stored = { id: FILE, name: "Headlines.pdf", contentType: "application/pdf", sizeBytes: 900, pathname: PATH };
const SHADE = "shade@example.com";
const pgError = (code: string) => Object.assign(new Error(`pg ${code}`), { code });

beforeEach(() => {
  vi.resetAllMocks();
  requireAdmin.mockResolvedValue({ email: SHADE });
  uploads.verifyTaskUpload.mockResolvedValue({ upload: stored });
  uploads.discardUpload.mockResolvedValue(undefined);
  store.addTaskUpload.mockResolvedValue("added");
  store.getTaskFile.mockResolvedValue(null);
  store.linkResource.mockResolvedValue("added");
  store.recordedPathnames.mockResolvedValue(new Set());
  store.removeTaskFile.mockResolvedValue({ pathname: PATH });
  blob.del.mockResolvedValue(undefined);
});

describe("saveTaskFileAction", () => {
  it("records the checked upload as the person who added it", async () => {
    expect(await actions.saveTaskFileAction(TASK, pending)).toEqual({ ok: true });
    expect(uploads.verifyTaskUpload).toHaveBeenCalledWith(TASK, pending);
    expect(store.addTaskUpload).toHaveBeenCalledWith(TASK, stored, SHADE);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/tasks");
  });
  it("passes on a failed check without recording", async () => {
    uploads.verifyTaskUpload.mockResolvedValue({ error: "That file is empty." });
    expect(await actions.saveTaskFileAction(TASK, pending)).toEqual({ error: "That file is empty." });
    expect(store.addTaskUpload).not.toHaveBeenCalled();
  });
  it("removes the upload and says so when the task was deleted while it uploaded", async () => {
    store.addTaskUpload.mockRejectedValue(pgError("23503"));
    expect(await actions.saveTaskFileAction(TASK, pending)).toEqual({ error: "That task was deleted." });
    expect(uploads.discardUpload).toHaveBeenCalledWith(PATH);
  });
  it("keeps the file when the write landed and only its reply was lost", async () => {
    store.addTaskUpload.mockRejectedValue(new Error("socket hang up"));
    store.getTaskFile.mockResolvedValue({ id: FILE });
    expect(await actions.saveTaskFileAction(TASK, pending)).toEqual({ ok: true });
    expect(uploads.discardUpload).not.toHaveBeenCalled();
  });
  it("refuses a malformed task id before anything else", async () => {
    expect(await actions.saveTaskFileAction("nope", pending)).toEqual({ error: "That upload can't be saved." });
    expect(uploads.verifyTaskUpload).not.toHaveBeenCalled();
  });
});

describe("linkResourceAction", () => {
  it("links the Resources file, and already linked counts as done", async () => {
    expect(await actions.linkResourceAction(TASK, RES)).toEqual({ ok: true });
    expect(store.linkResource).toHaveBeenCalledWith(TASK, RES, SHADE);
    store.linkResource.mockResolvedValue("exists");
    expect(await actions.linkResourceAction(TASK, RES)).toEqual({ ok: true });
  });
  it("says so when the task or the file was deleted", async () => {
    store.linkResource.mockRejectedValue(pgError("23503"));
    expect(await actions.linkResourceAction(TASK, RES)).toEqual({ error: "That task or file was deleted." });
  });
  it("refuses malformed ids", async () => {
    expect(await actions.linkResourceAction(TASK, "nope")).toEqual({ error: "That file can't be attached." });
    expect(store.linkResource).not.toHaveBeenCalled();
  });
});

describe("removeTaskFileAction", () => {
  it("deletes the row first, then the stored upload", async () => {
    expect(await actions.removeTaskFileAction(TASK, FILE)).toEqual({ ok: true });
    expect(store.removeTaskFile).toHaveBeenCalledWith(TASK, FILE);
    expect(blob.del).toHaveBeenCalledWith(PATH);
    expect(store.removeTaskFile.mock.invocationCallOrder[0]).toBeLessThan(blob.del.mock.invocationCallOrder[0]);
  });
  it("only unlinks a Resources file, leaving it in the library", async () => {
    store.removeTaskFile.mockResolvedValue({ pathname: null });
    expect(await actions.removeTaskFileAction(TASK, FILE)).toEqual({ ok: true });
    expect(blob.del).not.toHaveBeenCalled();
  });
  it("counts already gone as done, and logs a stored file it couldn't remove", async () => {
    store.removeTaskFile.mockResolvedValueOnce(null);
    expect(await actions.removeTaskFileAction(TASK, FILE)).toEqual({ ok: true });
    blob.del.mockRejectedValue(new Error("down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await actions.removeTaskFileAction(TASK, FILE)).toEqual({ ok: true });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("discardPendingUploadAction", () => {
  it("deletes an unrecorded task upload", async () => {
    expect(await actions.discardPendingUploadAction(PATH)).toEqual({ ok: true });
    expect(store.recordedPathnames).toHaveBeenCalledWith([PATH]);
    expect(uploads.discardUpload).toHaveBeenCalledWith(PATH);
  });
  it("never deletes a file a row records", async () => {
    store.recordedPathnames.mockResolvedValue(new Set([PATH]));
    expect(await actions.discardPendingUploadAction(PATH)).toEqual({ ok: true });
    expect(uploads.discardUpload).not.toHaveBeenCalled();
  });
  it("never touches a path that isn't a task upload", async () => {
    expect(await actions.discardPendingUploadAction(`resources/${FILE}/W-9.pdf`)).toEqual({ error: "That upload can't be removed." });
    expect(store.recordedPathnames).not.toHaveBeenCalled();
    expect(uploads.discardUpload).not.toHaveBeenCalled();
  });
});

describe("every file action checks the session first", () => {
  it.each([
    ["saveTaskFileAction", () => actions.saveTaskFileAction(TASK, pending)],
    ["linkResourceAction", () => actions.linkResourceAction(TASK, RES)],
    ["removeTaskFileAction", () => actions.removeTaskFileAction(TASK, FILE)],
    ["discardPendingUploadAction", () => actions.discardPendingUploadAction(PATH)],
  ])("%s", async (_name, run) => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    for (const fn of [...Object.values(store), ...Object.values(uploads), blob.del]) expect(fn).not.toHaveBeenCalled();
  });
});

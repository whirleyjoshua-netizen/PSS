import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = {
  createTask: vi.fn(), updateTask: vi.fn(), setTaskStatus: vi.fn(), deleteTask: vi.fn(),
  claimReminder: vi.fn(), releaseReminder: vi.fn(),
};
vi.mock("@/lib/admin/tasks", () => store);
const sendTaskEmail = vi.fn();
vi.mock("@/lib/admin/task-emails", async () => ({
  ...(await vi.importActual<object>("@/lib/admin/task-emails")),
  sendTaskEmail,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const listTaskFiles = vi.fn();
vi.mock("@/lib/admin/task-files", () => ({ listTaskFiles }));
const verifyTaskUpload = vi.fn();
vi.mock("@/lib/admin/task-file-uploads", () => ({ verifyTaskUpload }));
const blob = { del: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));

const actions = await import("@/app/admin/tasks/actions");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const ME = "joshua@x.com";
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};
const filled = { title: "Finish new flyers", notes: "", assignee: "shade@x.com", dueOn: "2026-10-09" };
const fields = filled;
const newForm = (entries: Record<string, string>, uploads: object[] = [], resourceIds: string[] = []) => {
  const data = form({ taskId: ID, ...entries });
  for (const upload of uploads) data.append("upload", JSON.stringify(upload));
  for (const id of resourceIds) data.append("resourceId", id);
  return data;
};
const created = (fileNames: string[] = []) => ({ id: ID, created: true, fileNames });

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: a rejecting implementation set in one test must not leak into the next.
  vi.resetAllMocks();
  requireAdmin.mockResolvedValue({ email: ME });
  sendTaskEmail.mockResolvedValue(true);
  listTaskFiles.mockResolvedValue([]);
  blob.del.mockResolvedValue(undefined);
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("createTaskAction", () => {
  it("checks the session before reading input", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.createTaskAction({}, newForm(fields))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.createTask).not.toHaveBeenCalled();
  });
  it("creates a to-do and emails the assignee", async () => {
    store.createTask.mockResolvedValue(created());
    expect(await actions.createTaskAction({}, newForm(fields))).toEqual({ ok: "Task added." });
    expect(store.createTask).toHaveBeenCalledWith(
      { title: "Finish new flyers", notes: null, assignee: "shade@x.com", dueOn: "2026-10-09", status: "todo" }, ME,
      { id: ID, uploads: [], resourceIds: [] });
    expect(sendTaskEmail).toHaveBeenCalledWith("shade@x.com", expect.objectContaining({ subject: "Joshua assigned you: Finish new flyers" }));
  });
  it("sends nothing when you assign yourself or nobody", async () => {
    store.createTask.mockResolvedValue(created());
    await actions.createTaskAction({}, newForm({ ...fields, assignee: ME }));
    await actions.createTaskAction({}, newForm({ ...fields, assignee: "" }));
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
  it("says so when the email fails, but the task is saved", async () => {
    store.createTask.mockResolvedValue(created());
    sendTaskEmail.mockResolvedValue(false);
    expect(await actions.createTaskAction({}, newForm(fields))).toEqual({
      ok: "Task added.", notice: "Saved, but the email to Shade didn't send.",
    });
  });
  it("returns what was typed on a bad form or a refused assignee", async () => {
    const bad = await actions.createTaskAction({}, newForm({ ...fields, title: " " }));
    expect(bad).toEqual({ error: "Give the task a title", values: { ...filled, title: " ", status: "todo" } });
    store.createTask.mockResolvedValue("not-assignable");
    expect((await actions.createTaskAction({}, newForm(fields))).error).toBe("That person no longer has access. Pick someone from the list.");
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });

  const FILE = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
  const RES = "5c4b3a29-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
  const pending = { pathname: `task-files/${ID}/${FILE}/Headlines.pdf`, name: "Headlines.pdf" };
  const stored = { id: FILE, name: "Headlines.pdf", contentType: "application/pdf", sizeBytes: 900, pathname: pending.pathname };

  it("saves the task with its checked uploads and picked Resources files, and the email lists them", async () => {
    verifyTaskUpload.mockResolvedValue({ upload: stored });
    store.createTask.mockResolvedValue(created(["Headlines.pdf", "Price guide.pdf"]));
    expect(await actions.createTaskAction({}, newForm(fields, [pending], [RES, RES]))).toEqual({ ok: "Task added." });
    expect(verifyTaskUpload).toHaveBeenCalledWith(ID, pending);
    expect(store.createTask).toHaveBeenCalledWith(expect.anything(), ME, { id: ID, uploads: [stored], resourceIds: [RES] });
    const email = sendTaskEmail.mock.calls[0][1] as { text: string };
    expect(email.text).toContain("Files:\n- Headlines.pdf\n- Price guide.pdf");
  });
  it("names an upload that failed its check and saves nothing", async () => {
    verifyTaskUpload.mockResolvedValue({ error: "The upload didn't finish. Try again." });
    const result = await actions.createTaskAction({}, newForm(fields, [pending]));
    expect(result.error).toBe("Headlines.pdf: The upload didn't finish. Try again. Remove it and try again.");
    expect(result.values?.title).toBe("Finish new flyers");
    expect(store.createTask).not.toHaveBeenCalled();
  });
  it("refuses a form with no task id, an unreadable upload or a malformed Resources id, before saving", async () => {
    for (const data of [form(fields), (() => { const d = newForm(fields); d.append("upload", "{oops"); return d; })(), newForm(fields, [], ["nope"])]) {
      expect((await actions.createTaskAction({}, data)).error).toBe("Reload the page and try again.");
    }
    expect(verifyTaskUpload).not.toHaveBeenCalled();
    expect(store.createTask).not.toHaveBeenCalled();
  });
  it("tells you when a picked Resources file was deleted meanwhile", async () => {
    store.createTask.mockRejectedValue(Object.assign(new Error("fk"), { code: "23503" }));
    expect((await actions.createTaskAction({}, newForm(fields, [], [RES]))).error).toBe(
      "A file you picked from Resources was deleted. Remove it and try again.");
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
  it("answers a repeat submit as added without a second email", async () => {
    store.createTask.mockResolvedValue({ id: ID, created: false, fileNames: [] });
    expect(await actions.createTaskAction({}, newForm(fields))).toEqual({ ok: "Task added." });
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
});

describe("updateTaskAction", () => {
  const edit = { ...filled, status: "doing" };
  it("emails only when the assignee changed to someone else", async () => {
    store.updateTask.mockResolvedValue({ previousAssignee: "shade@x.com" });
    expect(await actions.updateTaskAction(ID, {}, form(edit))).toEqual({ ok: "Saved.", values: edit });
    expect(sendTaskEmail).not.toHaveBeenCalled();
    store.updateTask.mockResolvedValue({ previousAssignee: ME });
    await actions.updateTaskAction(ID, {}, form(edit));
    expect(sendTaskEmail).toHaveBeenCalledTimes(1);
  });
  it("returns the saved, normalized values so the remounted form shows what was stored", async () => {
    store.updateTask.mockResolvedValue({ previousAssignee: "shade@x.com" });
    const padded = { title: "  Finish new flyers  ", notes: "  ", assignee: " Shade@X.com ", dueOn: " 2026-10-09 ", status: "doing" };
    expect(await actions.updateTaskAction(ID, {}, form(padded))).toEqual({
      ok: "Saved.",
      values: { title: "Finish new flyers", notes: "", assignee: "shade@x.com", dueOn: "2026-10-09", status: "doing" },
    });
  });
  it("emails the new assignee the task's files", async () => {
    store.updateTask.mockResolvedValue({ previousAssignee: null });
    listTaskFiles.mockResolvedValue([{ name: "Headlines.pdf" }]);
    await actions.updateTaskAction(ID, {}, form({ ...filled, status: "todo" }));
    expect(listTaskFiles).toHaveBeenCalledWith(ID);
    expect((sendTaskEmail.mock.calls[0][1] as { text: string }).text).toContain("Files:\n- Headlines.pdf");
  });
  it("reports a deleted task", async () => {
    store.updateTask.mockResolvedValue("missing");
    expect((await actions.updateTaskAction(ID, {}, form(edit))).error).toBe("That task was deleted.");
  });
  it("reports a refused assignee without emailing", async () => {
    store.updateTask.mockResolvedValue("not-assignable");
    expect(await actions.updateTaskAction(ID, {}, form(edit))).toEqual({
      error: "That person no longer has access. Pick someone from the list.", values: edit,
    });
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
});

describe("moveTaskAction", () => {
  it("moves to a real status only", async () => {
    await actions.moveTaskAction(ID, form({ status: "done" }));
    expect(store.setTaskStatus).toHaveBeenCalledWith(ID, "done");
    await actions.moveTaskAction(ID, form({ status: "blocked" }));
    expect(store.setTaskStatus).toHaveBeenCalledTimes(1);
  });
});

describe("remindTaskAction", () => {
  const claim = {
    task: { id: ID, title: "Finish new flyers", notes: null, dueOn: null, assigneeEmail: "shade@x.com" },
    claimedAt: "C", previousAt: null, previousBy: null,
  };
  it("emails the assignee with reply-to set to you", async () => {
    store.claimReminder.mockResolvedValue({ claim });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ ok: "Reminder sent to Shade." });
    expect(sendTaskEmail).toHaveBeenCalledWith("shade@x.com", expect.objectContaining({ subject: "Reminder from Joshua: Finish new flyers" }), ME);
    expect(store.releaseReminder).not.toHaveBeenCalled();
  });
  it("lists the task's files in the reminder, read before the claim is taken", async () => {
    listTaskFiles.mockResolvedValue([{ name: "Headlines.pdf" }]);
    store.claimReminder.mockResolvedValue({ claim });
    await actions.remindTaskAction(ID, {}, form({}));
    expect((sendTaskEmail.mock.calls[0][1] as { text: string }).text).toContain("Files:\n- Headlines.pdf");
    expect(listTaskFiles.mock.invocationCallOrder[0]).toBeLessThan(store.claimReminder.mock.invocationCallOrder[0]);
  });
  it("gives the claim back when the email fails", async () => {
    store.claimReminder.mockResolvedValue({ claim });
    sendTaskEmail.mockResolvedValue(false);
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "The reminder didn't send. Try again." });
    expect(store.releaseReminder).toHaveBeenCalledWith(ID, claim);
  });
  it("still reports the failed send when giving the claim back also fails", async () => {
    store.claimReminder.mockResolvedValue({ claim });
    sendTaskEmail.mockResolvedValue(false);
    store.releaseReminder.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(actions.remindTaskAction(ID, {}, form({}))).resolves.toEqual({ error: "The reminder didn't send. Try again." });
    expect(consoleError).toHaveBeenCalled();
  });
  it("explains each refusal without sending", async () => {
    store.claimReminder.mockResolvedValueOnce({ refused: "recent", lastAt: new Date("2026-10-01T17:42:00Z") });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "Already reminded at 10:42 AM." });
    store.claimReminder.mockResolvedValueOnce({ refused: "recent", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "Already reminded a moment ago." });
    store.claimReminder.mockResolvedValueOnce({ refused: "done", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "That task is already done." });
    store.claimReminder.mockResolvedValueOnce({ refused: "unassigned", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "Assign the task to someone first." });
    store.claimReminder.mockResolvedValueOnce({ refused: "missing", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "That task was deleted." });
    expect(sendTaskEmail).not.toHaveBeenCalled();
    expect(store.releaseReminder).not.toHaveBeenCalled();
  });
});

describe("deleteTaskAction", () => {
  it("deletes and returns to the board", async () => {
    store.deleteTask.mockResolvedValue([]);
    await expect(actions.deleteTaskAction(ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(store.deleteTask).toHaveBeenCalledWith(ID);
    expect(blob.del).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin/tasks");
  });
  it("removes the deleted task's uploads from storage, and still returns to the board if that fails", async () => {
    store.deleteTask.mockResolvedValue(["task-files/a", "task-files/b"]);
    await expect(actions.deleteTaskAction(ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(blob.del).toHaveBeenCalledWith(["task-files/a", "task-files/b"]);
    blob.del.mockRejectedValue(new Error("down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(actions.deleteTaskAction(ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("every action checks the session first", () => {
  beforeEach(() => { requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT")); });
  it("updateTaskAction", async () => {
    await expect(actions.updateTaskAction(ID, {}, form({ ...filled, status: "doing" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.updateTask).not.toHaveBeenCalled();
  });
  it("moveTaskAction", async () => {
    await expect(actions.moveTaskAction(ID, form({ status: "done" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.setTaskStatus).not.toHaveBeenCalled();
  });
  it("remindTaskAction", async () => {
    await expect(actions.remindTaskAction(ID, {}, form({}))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.claimReminder).not.toHaveBeenCalled();
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
  it("deleteTaskAction", async () => {
    await expect(actions.deleteTaskAction(ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(store.deleteTask).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

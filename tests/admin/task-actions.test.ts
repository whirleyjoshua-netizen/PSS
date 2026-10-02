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

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: a rejecting implementation set in one test must not leak into the next.
  vi.resetAllMocks();
  requireAdmin.mockResolvedValue({ email: ME });
  sendTaskEmail.mockResolvedValue(true);
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("createTaskAction", () => {
  it("checks the session before reading input", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.createTaskAction({}, form(filled))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.createTask).not.toHaveBeenCalled();
  });
  it("creates a to-do and emails the assignee", async () => {
    store.createTask.mockResolvedValue({ id: ID });
    expect(await actions.createTaskAction({}, form(filled))).toEqual({ ok: "Task added." });
    expect(store.createTask).toHaveBeenCalledWith(
      { title: "Finish new flyers", notes: null, assignee: "shade@x.com", dueOn: "2026-10-09", status: "todo" }, ME);
    expect(sendTaskEmail).toHaveBeenCalledWith("shade@x.com", expect.objectContaining({ subject: "Joshua assigned you: Finish new flyers" }));
  });
  it("sends nothing when you assign yourself or nobody", async () => {
    store.createTask.mockResolvedValue({ id: ID });
    await actions.createTaskAction({}, form({ ...filled, assignee: ME }));
    await actions.createTaskAction({}, form({ ...filled, assignee: "" }));
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
  it("says so when the email fails, but the task is saved", async () => {
    store.createTask.mockResolvedValue({ id: ID });
    sendTaskEmail.mockResolvedValue(false);
    expect(await actions.createTaskAction({}, form(filled))).toEqual({
      ok: "Task added.", notice: "Saved, but the email to Shade didn't send.",
    });
  });
  it("returns what was typed on a bad form or a refused assignee", async () => {
    const bad = await actions.createTaskAction({}, form({ ...filled, title: " " }));
    expect(bad).toEqual({ error: "Give the task a title", values: { ...filled, title: " ", status: "todo" } });
    store.createTask.mockResolvedValue("not-assignable");
    expect((await actions.createTaskAction({}, form(filled))).error).toBe("That person no longer has access. Pick someone from the list.");
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
    await expect(actions.deleteTaskAction(ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(store.deleteTask).toHaveBeenCalledWith(ID);
    expect(redirect).toHaveBeenCalledWith("/admin/tasks");
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

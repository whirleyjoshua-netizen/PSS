import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
vi.mock("@vercel/blob/client", () => ({ upload }));
const fileActions = {
  saveTaskFileAction: vi.fn(), linkResourceAction: vi.fn(), removeTaskFileAction: vi.fn(), discardPendingUploadAction: vi.fn(),
};
vi.mock("@/app/admin/tasks/file-actions", () => fileActions);
vi.mock("@/app/admin/tasks/actions", () => ({}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { FilePicker } = await import("@/app/admin/tasks/FilePicker");
const { TaskFiles } = await import("@/app/admin/tasks/TaskFiles");
const { TaskForm } = await import("@/app/admin/tasks/TaskForm");

const TASK = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const PATH = new RegExp(`^task-files/${TASK}/[0-9a-f-]{36}/Headlines.pdf$`);
const ANY_TASK_PATH = /^task-files\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/Headlines\.pdf$/;
const pdf = (bytes = 4) => new File([new Uint8Array(bytes)], "Headlines.pdf", { type: "application/pdf" });
const resources = [
  { id: "5c4b3a29-1e2f-4a3b-8c4d-5e6f7a8b9c0d", name: "Price guide.pdf", category: "Pricing" },
  { id: "6d5c4b3a-1e2f-4a3b-8c4d-5e6f7a8b9c0d", name: "W-9.pdf", category: "Licenses" },
];
const defaults = { title: "", notes: "", assignee: "", dueOn: "", status: "todo" };

/** An upload that finishes only when the test says so. */
function heldUpload() {
  let finish: () => void = () => {};
  upload.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ pathname: "p" }); }));
  return () => act(async () => { finish(); });
}

beforeEach(() => {
  vi.resetAllMocks();
  upload.mockResolvedValue({ pathname: "p" });
  fileActions.saveTaskFileAction.mockResolvedValue({ ok: true });
  fileActions.linkResourceAction.mockResolvedValue({ ok: true });
  fileActions.removeTaskFileAction.mockResolvedValue({ ok: true });
  fileActions.discardPendingUploadAction.mockResolvedValue({ ok: true });
});

const picker = (over: Partial<Parameters<typeof FilePicker>[0]> = {}) => {
  const props = {
    taskId: TASK, resources, attachedResourceIds: [], idPrefix: "p",
    onUploaded: vi.fn(async () => null), onPickResource: vi.fn(async () => null), onBusyChange: vi.fn(), ...over,
  };
  render(<FilePicker {...props} />);
  return props;
};

describe("FilePicker", () => {
  it("uploads privately under the task through the task upload route, then hands the file on", async () => {
    const props = picker();
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    await waitFor(() => expect(props.onUploaded).toHaveBeenCalled());
    const [pathname, , options] = upload.mock.calls[0];
    expect(pathname).toMatch(PATH);
    expect(options).toMatchObject({ access: "private", handleUploadUrl: "/admin/tasks/upload", multipart: true });
    expect(props.onUploaded).toHaveBeenCalledWith({ pathname, name: "Headlines.pdf" });
    // Done files leave the progress list: the caller lists them.
    await waitFor(() => expect(screen.queryByText("Headlines.pdf")).toBeNull());
  });

  it("says it's busy while an upload runs, and not after", async () => {
    const finish = heldUpload();
    const props = picker();
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    expect(await screen.findByRole("progressbar", { name: "Uploading Headlines.pdf" })).toBeInTheDocument();
    expect(props.onBusyChange).toHaveBeenLastCalledWith(true);
    await finish();
    await waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
  });

  it("shows why a file wasn't saved, and keeps it in the list", async () => {
    picker({ onUploaded: vi.fn(async () => "That task was deleted.") });
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    expect(await screen.findByText("That task was deleted.")).toBeInTheDocument();
    expect(screen.getByText("Headlines.pdf")).toBeInTheDocument();
  });

  it("refuses an empty file without uploading it, and reports a failed upload", async () => {
    const props = picker();
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf(0));
    expect(await screen.findByText("That file is empty.")).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    upload.mockRejectedValueOnce(new Error("network"));
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    expect(await screen.findByText("Upload failed. Check your connection and try again.")).toBeInTheDocument();
    expect(props.onUploaded).not.toHaveBeenCalled();
  });

  it("lists Resources to search and attach, with ones already attached marked", async () => {
    const props = picker({ attachedResourceIds: [resources[1].id] });
    await userEvent.click(screen.getByRole("button", { name: "Add from Resources" }));
    expect(screen.getByRole("button", { name: "Attach W-9.pdf" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Attach W-9.pdf" })).toHaveTextContent("Attached");
    await userEvent.type(screen.getByLabelText("Search Resources"), "pric");
    expect(screen.queryByText("W-9.pdf")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Attach Price guide.pdf" }));
    expect(props.onPickResource).toHaveBeenCalledWith(resources[0]);
  });

  it("shows why a Resources file couldn't be attached", async () => {
    picker({ onPickResource: vi.fn(async () => "That task or file was deleted.") });
    await userEvent.click(screen.getByRole("button", { name: "Add from Resources" }));
    await userEvent.click(screen.getByRole("button", { name: "Attach Price guide.pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That task or file was deleted.");
  });
});

describe("TaskFiles (the task page)", () => {
  const files = [
    { id: "f1", taskId: TASK, resourceId: null, name: "Headlines.pdf", contentType: "application/pdf", sizeBytes: 4, addedBy: "joshua@x.com", createdAt: new Date(0) },
    { id: "f2", taskId: TASK, resourceId: resources[0].id, name: "Price guide.pdf", contentType: "application/pdf", sizeBytes: 9, addedBy: "shade@x.com", createdAt: new Date(0) },
  ];

  it("saves an upload to the task as soon as it's done, then refreshes", async () => {
    render(<TaskFiles taskId={TASK} files={[]} resources={resources} />);
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    await waitFor(() => expect(fileActions.saveTaskFileAction).toHaveBeenCalledWith(TASK, { pathname: expect.stringMatching(PATH), name: "Headlines.pdf" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("links a picked Resources file and marks ones already linked", async () => {
    render(<TaskFiles taskId={TASK} files={files} resources={resources} />);
    await userEvent.click(screen.getByRole("button", { name: "Add from Resources" }));
    expect(screen.getByRole("button", { name: "Attach Price guide.pdf" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Attach W-9.pdf" }));
    expect(fileActions.linkResourceAction).toHaveBeenCalledWith(TASK, resources[1].id);
  });

  it("asks before removing, and says a linked file stays in Resources", async () => {
    render(<TaskFiles taskId={TASK} files={files} resources={resources} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Price guide.pdf" }));
    expect(screen.getByText("Remove Price guide.pdf from this task? It stays in Resources.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(fileActions.removeTaskFileAction).toHaveBeenCalledWith(TASK, "f2");
    await userEvent.click(screen.getByRole("button", { name: "Remove Headlines.pdf" }));
    expect(screen.getByText("Remove Headlines.pdf? This deletes the file.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(fileActions.removeTaskFileAction).toHaveBeenCalledTimes(1);
  });
});

describe("TaskForm with files (the new task form)", () => {
  const renderForm = (action = vi.fn(async (_prev: object, _data: FormData) => ({ ok: "Task added." }))) => {
    render(<TaskForm action={action} people={["joshua@x.com"]} defaults={defaults} submitLabel="Add task" idPrefix="new" newFiles={{ resources }} />);
    return action;
  };

  it("sends the task id it made, each held upload and each picked Resources file with the task", async () => {
    const action = renderForm();
    await userEvent.type(screen.getByLabelText("Title"), "Review ad copy");
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    expect(await screen.findByRole("button", { name: "Remove Headlines.pdf" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add from Resources" }));
    await userEvent.click(screen.getByRole("button", { name: "Attach Price guide.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1];
    const taskId = String(data.get("taskId"));
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
    const [held] = data.getAll("upload").map((raw) => JSON.parse(String(raw)));
    expect(held.name).toBe("Headlines.pdf");
    expect(held.pathname.startsWith(`task-files/${taskId}/`)).toBe(true);
    expect(data.getAll("resourceId")).toEqual([resources[0].id]);
    expect(data.get("title")).toBe("Review ad copy");
    expect(fileActions.saveTaskFileAction).not.toHaveBeenCalled();
  });

  it("can't be added while an upload is still running", async () => {
    const finish = heldUpload();
    renderForm();
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    await waitFor(() => expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled());
    expect(screen.getByText("Waiting for uploads to finish…")).toBeInTheDocument();
    await finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled());
  });

  it("deletes an upload removed before saving, and sends it no more", async () => {
    const action = renderForm();
    await userEvent.type(screen.getByLabelText("Title"), "Review ad copy");
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    await userEvent.click(await screen.findByRole("button", { name: "Remove Headlines.pdf" }));
    expect(fileActions.discardPendingUploadAction).toHaveBeenCalledWith(expect.stringMatching(ANY_TASK_PATH));
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][1].getAll("upload")).toEqual([]);
  });

  it("keeps the files through an error, and starts afresh with a new task id once added", async () => {
    const action = vi.fn()
      .mockResolvedValueOnce({ error: "Give the task a title", values: { ...defaults, title: "x" } })
      .mockResolvedValueOnce({ ok: "Task added." })
      .mockResolvedValueOnce({ ok: "Task added." });
    renderForm(action);
    await userEvent.type(screen.getByLabelText("Title"), "x");
    await userEvent.upload(screen.getByLabelText("Upload files"), pdf());
    await screen.findByRole("button", { name: "Remove Headlines.pdf" });
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the task a title");
    expect(screen.getByRole("button", { name: "Remove Headlines.pdf" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Task added.");
    const firstId = action.mock.calls[1][1].get("taskId");
    expect(action.mock.calls[0][1].get("taskId")).toBe(firstId);
    expect(action.mock.calls[1][1].getAll("upload")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove Headlines.pdf" })).toBeNull());
    await userEvent.type(screen.getByLabelText("Title"), "Next one");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    expect(action.mock.calls[2][1].get("taskId")).not.toBe(firstId);
    expect(action.mock.calls[2][1].getAll("upload")).toEqual([]);
  });

  it("is unchanged on the task page, where files save on their own", () => {
    render(<TaskForm action={vi.fn()} people={[]} defaults={defaults} submitLabel="Save" idPrefix="edit" />);
    expect(screen.queryByRole("group", { name: "Files" })).toBeNull();
    expect(within(document.querySelector("form") as HTMLElement).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

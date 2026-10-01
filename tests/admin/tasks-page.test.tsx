import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Task } from "@/lib/admin/task-rules";

const store = { listTasks: vi.fn(), assignableEmails: vi.fn(), getTask: vi.fn() };
vi.mock("@/lib/admin/tasks", () => store);
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "joshua@x.com" })) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/admin/tasks/actions", () => ({
  createTaskAction: vi.fn(async () => ({})), updateTaskAction: vi.fn(async () => ({})),
  moveTaskAction: vi.fn(), remindTaskAction: vi.fn(async () => ({})), deleteTaskAction: vi.fn(),
}));

const { default: TasksPage } = await import("@/app/admin/tasks/page");
const { default: TaskPage } = await import("@/app/admin/tasks/[id]/page");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const task = (over: Partial<Task>): Task => ({
  id: ID, title: "Finish new flyers", notes: null, status: "todo", assigneeEmail: "shade@x.com", dueOn: null,
  createdBy: "joshua@x.com", createdAt: new Date("2026-09-01T00:00:00Z"), completedAt: null,
  lastRemindedAt: null, lastRemindedBy: null, ...over,
});
const open = async (view?: string) => render(await TasksPage({ searchParams: Promise.resolve(view ? { view } : {}) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T17:00:00Z")); // 10 AM Thu Oct 1, Las Vegas
  store.listTasks.mockReset().mockResolvedValue([]);
  store.assignableEmails.mockReset().mockResolvedValue(["joshua@x.com", "shade@x.com"]);
  store.getTask.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TasksPage", () => {
  it("shows three columns with counts", async () => {
    store.listTasks.mockResolvedValue([task({}), task({ id: "b", title: "Order samples", status: "doing" })]);
    await open();
    expect(screen.getByRole("region", { name: "To do (1)" })).toHaveTextContent("Finish new flyers");
    expect(screen.getByRole("region", { name: "In progress (1)" })).toHaveTextContent("Order samples");
    expect(screen.getByRole("region", { name: "Done (0)" })).toHaveTextContent("Nothing finished in the last 14 days.");
  });
  it("flags overdue and due-today tasks in words", async () => {
    store.listTasks.mockResolvedValue([task({ dueOn: "2026-09-30" }), task({ id: "b", title: "Call vendor", dueOn: "2026-10-01" })]);
    await open();
    const todo = within(screen.getByRole("region", { name: "To do (2)" }));
    expect(todo.getByText("Overdue by 1 day")).toHaveClass("text-overdue");
    expect(todo.getByText("Due today")).toBeInTheDocument();
  });
  it("shows who it is for, the reminder line, and Remind only when it can be sent", async () => {
    store.listTasks.mockResolvedValue([
      task({ lastRemindedAt: new Date("2026-10-01T16:42:00Z"), lastRemindedBy: "joshua@x.com" }),
      task({ id: "b", title: "Nobody's", assigneeEmail: null }),
      task({ id: "c", title: "Finished", status: "done", completedAt: new Date("2026-09-30T17:00:00Z") }),
    ]);
    await open();
    // Scoped to the column: the New task form's dropdown also says "Unassigned".
    const todo = within(screen.getByRole("region", { name: "To do (2)" }));
    expect(todo.getByText("Shade")).toBeInTheDocument();
    expect(todo.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Reminded Thu, Oct 1, 9:42 AM")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remind now/ })).toHaveLength(1);
  });
  it("filters to my tasks with ?view=mine", async () => {
    store.listTasks.mockResolvedValue([task({}), task({ id: "b", title: "My samples", assigneeEmail: "joshua@x.com" })]);
    await open("mine");
    expect(screen.queryByText("Finish new flyers")).toBeNull();
    expect(screen.getByText("My samples")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mine" })).toHaveAttribute("aria-current", "page");
  });
  it("defaults a new task to me", async () => {
    await open();
    expect(screen.getByLabelText("Assigned to")).toHaveValue("joshua@x.com");
  });
});

describe("TaskPage", () => {
  it("is not found for an unknown task", async () => {
    store.getTask.mockResolvedValue(null);
    await expect(TaskPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("edits every field and keeps a removed person's name on a done task", async () => {
    store.getTask.mockResolvedValue(task({ status: "done", completedAt: new Date(), assigneeEmail: "gone@x.com" }));
    render(await TaskPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Finish new flyers" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assigned to")).toHaveValue("gone@x.com");
    expect(screen.getByRole("option", { name: "Gone (gone@x.com) — no access" })).toHaveValue("gone@x.com");
    expect(screen.getByLabelText("Status")).toHaveValue("done");
    expect(screen.queryByRole("button", { name: /^Remind now/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

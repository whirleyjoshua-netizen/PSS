import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/tasks/actions", () => ({}));
const { TaskForm } = await import("@/app/admin/tasks/TaskForm");

const defaults = { title: "", notes: "", assignee: "joshua@x.com", dueOn: "", status: "todo" };

describe("TaskForm", () => {
  it("lists people by name with Unassigned first", () => {
    render(<TaskForm action={vi.fn(async () => ({}))} people={["joshua@x.com", "shade@x.com"]} defaults={defaults} submitLabel="Add task" idPrefix="new" />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Unassigned", "Joshua (joshua@x.com)", "Shade (shade@x.com)"]);
  });
  it("shows an error and keeps what was typed", async () => {
    const action = vi.fn(async () => ({ error: "Give the task a title", values: { ...defaults, notes: "keep me" } }));
    render(<TaskForm action={action} people={["joshua@x.com"]} defaults={defaults} submitLabel="Add task" idPrefix="new" />);
    // Fill the title so the browser's `required` check can't block the submit; the error comes from the action.
    await userEvent.type(screen.getByLabelText("Title"), "Flyers");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the task a title");
    expect(screen.getByLabelText("Notes")).toHaveValue("keep me");
  });
  it("shows a saved notice as status, not as an error", async () => {
    const action = vi.fn(async () => ({ ok: "Task added.", notice: "Saved, but the email to Shade didn't send." }));
    render(<TaskForm action={action} people={["joshua@x.com"]} defaults={defaults} submitLabel="Add task" idPrefix="new" />);
    await userEvent.type(screen.getByLabelText("Title"), "Flyers");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Task added. Saved, but the email to Shade didn't send.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

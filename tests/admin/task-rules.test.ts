// tests/admin/task-rules.test.ts
import { describe, it, expect } from "vitest";
import {
  addDays, boardColumns, displayName, dueLine, dueState, isTaskStatus, type Task,
} from "@/lib/admin/task-rules";

const task = (over: Partial<Task>): Task => ({
  id: "t", title: "T", notes: null, status: "todo", assigneeEmail: null, dueOn: null,
  createdBy: "a@x.com", createdAt: new Date("2026-09-01T00:00:00Z"), completedAt: null,
  lastRemindedAt: null, lastRemindedBy: null, fileCount: 0, ...over,
});
const TODAY = "2026-10-01"; // a Thursday

describe("displayName", () => {
  it("title-cases the email's local part", () => {
    expect(displayName("joshua.whirley@gmail.com")).toBe("Joshua Whirley");
    expect(displayName("shade@example.com")).toBe("Shade");
    expect(displayName("e2e-tasks-mate@example.com")).toBe("E2e Tasks Mate");
    expect(displayName("ann_lee@x.com")).toBe("Ann Lee");
  });
});

describe("isTaskStatus", () => {
  it("accepts only the three statuses", () => {
    expect(["todo", "doing", "done"].every(isTaskStatus)).toBe(true);
    expect(isTaskStatus("blocked")).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    // Plain calendar boundaries: the math runs at noon UTC, so no time zone or DST change can reach it.
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});

describe("dueState and dueLine", () => {
  it("has no state without a date", () => {
    expect(dueState(null, TODAY)).toBe("none");
    expect(dueLine(null, TODAY)).toBe("No due date");
  });
  it("is overdue before today, counting days", () => {
    expect(dueState("2026-09-30", TODAY)).toBe("overdue");
    expect(dueLine("2026-09-30", TODAY)).toBe("Overdue by 1 day");
    expect(dueLine("2026-09-28", TODAY)).toBe("Overdue by 3 days");
  });
  it("is due today on the day", () => {
    expect(dueState(TODAY, TODAY)).toBe("today");
    expect(dueLine(TODAY, TODAY)).toBe("Due today");
  });
  it("names the day when it is ahead", () => {
    expect(dueState("2026-10-09", TODAY)).toBe("upcoming");
    expect(dueLine("2026-10-09", TODAY)).toBe("Due Fri, Oct 9");
  });
});

describe("boardColumns", () => {
  const now = new Date("2026-10-01T17:00:00Z");
  it("sorts open tasks by due date, undated last, ties oldest first", () => {
    const undated = task({ id: "undated" });
    const late = task({ id: "late", dueOn: "2026-09-29" });
    const soonNew = task({ id: "soon-new", dueOn: "2026-10-03", createdAt: new Date("2026-09-20T00:00:00Z") });
    const soonOld = task({ id: "soon-old", dueOn: "2026-10-03", createdAt: new Date("2026-09-10T00:00:00Z") });
    const doing = task({ id: "doing", status: "doing" });
    const columns = boardColumns([undated, soonNew, late, soonOld, doing], now);
    expect(columns.todo.map((t) => t.id)).toEqual(["late", "soon-old", "soon-new", "undated"]);
    expect(columns.doing.map((t) => t.id)).toEqual(["doing"]);
  });
  it("shows Done for 14 days, newest first", () => {
    const fresh = task({ id: "fresh", status: "done", completedAt: new Date("2026-09-30T17:00:00Z") });
    const edge = task({ id: "edge", status: "done", completedAt: new Date("2026-09-17T17:00:00Z") }); // exactly 14 days
    const old = task({ id: "old", status: "done", completedAt: new Date("2026-09-16T17:00:00Z") });
    expect(boardColumns([edge, old, fresh], now).done.map((t) => t.id)).toEqual(["fresh", "edge"]);
  });
});

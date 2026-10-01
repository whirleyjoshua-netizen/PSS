// tests/admin/task-schema.test.ts
import { describe, it, expect } from "vitest";
import { taskInputSchema } from "@/lib/admin/task-schema";

const base = { title: "Finish new flyers", notes: "", assignee: "", dueOn: "", status: "todo" };
const parse = (over: Partial<typeof base>) => taskInputSchema.safeParse({ ...base, ...over });
const message = (over: Partial<typeof base>) => {
  const result = parse(over);
  return result.success ? null : result.error.issues[0].message;
};

describe("taskInputSchema", () => {
  it("turns blanks into nulls and trims the title", () => {
    expect(parse({ title: "  Finish new flyers  " })).toEqual({
      success: true,
      data: { title: "Finish new flyers", notes: null, assignee: null, dueOn: null, status: "todo" },
    });
  });
  it("normalizes the assignee", () => {
    const result = parse({ assignee: "  Shade@Example.COM " });
    expect(result.success && result.data.assignee).toBe("shade@example.com");
  });
  it("keeps a real date", () => {
    const result = parse({ dueOn: "2026-10-09" });
    expect(result.success && result.data.dueOn).toBe("2026-10-09");
  });
  it("rejects a blank or long title", () => {
    expect(message({ title: "   " })).toBe("Give the task a title");
    expect(message({ title: "x".repeat(201) })).toBe("Keep the title to 200 characters");
    expect(parse({ title: "x".repeat(200) }).success).toBe(true);
  });
  it("rejects long notes", () => {
    expect(message({ notes: "x".repeat(2001) })).toBe("Keep the notes to 2000 characters");
  });
  it("rejects an impossible date and a malformed assignee", () => {
    expect(message({ dueOn: "2026-02-30" })).toBe("Pick a due date from the calendar");
    expect(message({ dueOn: "next friday" })).toBe("Pick a due date from the calendar");
    expect(message({ assignee: "shade" })).toBe("Pick someone from the list");
  });
  it("rejects an unknown status", () => {
    expect(parse({ status: "blocked" }).success).toBe(false);
  });
});

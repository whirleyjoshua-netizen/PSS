// tests/admin/task-emails.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@/lib/admin/task-rules";
import { business } from "@/content/business";

const listDigestTasks = vi.fn();
vi.mock("@/lib/admin/tasks", () => ({ listDigestTasks }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { assignmentEmail, reminderEmail, digestEmails, sendTaskEmail, sendTaskDigest } = await import("@/lib/admin/task-emails");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const task = (over: Partial<Task>): Task => ({
  id: ID, title: "Finish new flyers", notes: null, status: "todo", assigneeEmail: "shade@x.com", dueOn: null,
  createdBy: "joshua.whirley@x.com", createdAt: new Date("2026-09-01T00:00:00Z"), completedAt: null,
  lastRemindedAt: null, lastRemindedBy: null, fileCount: 0, ...over,
});
const summary = (over: Partial<Task>, fileNames: string[] = []) => ({ ...task(over), fileNames });
const now = new Date("2026-10-01T14:00:00Z"); // 7:00 AM Thu Oct 1, Las Vegas

beforeEach(() => {
  listDigestTasks.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("assignmentEmail", () => {
  it("names who assigned it, the due day, the notes and the link", () => {
    expect(assignmentEmail(summary({ dueOn: "2026-10-09", notes: "Use the fall photos" }), "joshua.whirley@x.com")).toEqual({
      subject: "Joshua Whirley assigned you: Finish new flyers",
      text: ["Due Fri, Oct 9", "", "Use the fall photos", "", `Open the task: https://pss.test/admin/tasks/${ID}`].join("\n"),
    });
  });
  it("says when there is no due date and skips empty notes", () => {
    expect(assignmentEmail(summary({}), "joshua.whirley@x.com").text).toBe(
      ["No due date", "", `Open the task: https://pss.test/admin/tasks/${ID}`].join("\n"));
  });
});

describe("files in task emails", () => {
  it("lists each file by name under the notes, before the link, without attaching anything", () => {
    const files = ["Google headlines.pdf", "Price guide.pdf"];
    const expected = [
      "Due Fri, Oct 9", "", "Check these", "", "Files:", "- Google headlines.pdf", "- Price guide.pdf", "",
      `Open the task: https://pss.test/admin/tasks/${ID}`,
    ].join("\n");
    expect(assignmentEmail(summary({ dueOn: "2026-10-09", notes: "Check these" }, files), "joshua.whirley@x.com").text).toBe(expected);
    const reminder = reminderEmail(summary({ dueOn: "2026-10-09" }, files), "joshua.whirley@x.com", now).text;
    expect(reminder).toContain("Files:\n- Google headlines.pdf\n- Price guide.pdf\n\nOpen the task:");
  });
});

describe("reminderEmail", () => {
  it("counts overdue days in Las Vegas time", () => {
    // 11:30 PM Oct 1 in Las Vegas is already Oct 2 in UTC; the task due Sep 30 is 1 day late, not 2.
    const lateNight = new Date("2026-10-02T06:30:00Z");
    const email = reminderEmail(summary({ dueOn: "2026-09-30" }), "joshua.whirley@x.com", lateNight);
    expect(email.subject).toBe("Reminder from Joshua Whirley: Finish new flyers");
    expect(email.text.split("\n")[0]).toBe("Overdue by 1 day");
  });
});

describe("digestEmails", () => {
  it("sends each person only their own tasks, in sections, skipping empty ones", () => {
    const tasks = [
      task({ id: "a", title: "Old", dueOn: "2026-09-29" }),
      task({ id: "b", title: "Now", dueOn: "2026-10-01" }),
      task({ id: "c", title: "Soon", dueOn: "2026-10-02", assigneeEmail: "joshua.whirley@x.com" }),
    ];
    const emails = digestEmails(tasks, now);
    expect(emails.map((e) => e.to)).toEqual(["joshua.whirley@x.com", "shade@x.com"]);
    expect(emails[1].email).toEqual({
      subject: "Your tasks for Thu, Oct 1, 2026: 2",
      text: [
        "Overdue", "- Old · Overdue by 2 days", "  https://pss.test/admin/tasks/a",
        "", "Due today", "- Now", "  https://pss.test/admin/tasks/b",
      ].join("\n"),
    });
    expect(emails[0].email.text).toBe(["Due tomorrow", "- Soon", "  https://pss.test/admin/tasks/c"].join("\n"));
  });
  it("leaves out done, unassigned, undated and later tasks", () => {
    const emails = digestEmails([
      task({ id: "done", title: "Done", status: "done", dueOn: "2026-10-01" }),
      task({ id: "nobody", title: "Nobody", assigneeEmail: null, dueOn: "2026-10-01" }),
      task({ id: "undated", title: "Undated", dueOn: null }),
      task({ id: "later", title: "Later", dueOn: "2026-10-03" }),
      task({ id: "in", title: "Included", dueOn: "2026-10-01" }),
    ], now);
    expect(emails).toEqual([{
      to: "shade@x.com",
      email: { subject: "Your tasks for Thu, Oct 1, 2026: 1", text: ["Due today", "- Included", "  https://pss.test/admin/tasks/in"].join("\n") },
    }]);
  });
  it("uses the Pacific day late at night, after daylight saving ends", () => {
    const lateNight = new Date("2026-11-02T07:30:00Z"); // 11:30 PM PST Sun Nov 1; already Nov 2 in UTC
    const [only] = digestEmails([task({ dueOn: "2026-11-02" })], lateNight);
    expect(only.email.text.split("\n")[0]).toBe("Due tomorrow");
  });
});

describe("sendTaskEmail", () => {
  it("sends plain text from the business with an optional reply-to", async () => {
    vi.stubEnv("LEAD_FROM_EMAIL", undefined);
    expect(await sendTaskEmail("shade@x.com", { subject: "S", text: "T" }, "joshua@x.com")).toBe(true);
    expect(send.mock.calls[0][0]).toEqual({
      from: `${business.name} <leads@premiershadesolutions.com>`, to: "shade@x.com", subject: "S", text: "T", replyTo: "joshua@x.com",
    });
    expect(await sendTaskEmail("shade@x.com", { subject: "S", text: "T" })).toBe(true);
    expect(send.mock.calls[1][0]).not.toHaveProperty("replyTo");
  });
  it("is false, never a throw, when unconfigured, rejected or down", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendTaskEmail("s@x.com", { subject: "S", text: "T" })).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    send.mockResolvedValueOnce({ error: { message: "bad" } });
    expect(await sendTaskEmail("s@x.com", { subject: "S", text: "T" })).toBe(false);
    send.mockRejectedValueOnce(new Error("network"));
    expect(await sendTaskEmail("s@x.com", { subject: "S", text: "T" })).toBe(false);
  });
});

describe("sendTaskDigest", () => {
  it("asks for tasks due through tomorrow and sends one email per person", async () => {
    listDigestTasks.mockResolvedValue([task({ dueOn: "2026-10-01" }), task({ id: "c", dueOn: "2026-10-02", assigneeEmail: "j@x.com" })]);
    expect(await sendTaskDigest(now)).toEqual({ sent: 2, failed: 0 });
    expect(listDigestTasks).toHaveBeenCalledWith("2026-10-02");
  });
  it("keeps going after one failure and reports it", async () => {
    listDigestTasks.mockResolvedValue([task({ dueOn: "2026-10-01" }), task({ id: "c", dueOn: "2026-10-02", assigneeEmail: "j@x.com" })]);
    send.mockResolvedValueOnce({ error: { message: "down" } });
    expect(await sendTaskDigest(now)).toEqual({ sent: 1, failed: 1, error: "1 task digest email didn't send" });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("sends nothing when nothing is due, and reports a database error", async () => {
    expect(await sendTaskDigest(now)).toEqual({ sent: 0, failed: 0 });
    listDigestTasks.mockRejectedValue(new Error("db down"));
    expect(await sendTaskDigest(now)).toEqual({ sent: 0, failed: 0, error: "db down" });
  });
});

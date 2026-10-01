import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const listAddedAdmins = vi.fn();
vi.mock("@/lib/admin/admin-access", () => ({ listAddedAdmins }));

const store = await import("@/lib/admin/tasks");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const row = {
  id: ID, title: "Flyers", notes: null, status: "todo", assignee_email: "shade@x.com", due_on: "2026-10-09",
  created_by: "joshua@x.com", created_at: "2026-10-01T15:00:00Z", completed_at: null,
  last_reminded_at: null, last_reminded_by: null,
};
const input = { title: "Flyers", notes: null, assignee: "shade@x.com", dueOn: "2026-10-09", status: "todo" as const };

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  listAddedAdmins.mockReset().mockResolvedValue([]);
  vi.stubEnv("ADMIN_EMAILS", "Joshua@x.com, owner2@x.com");
});

describe("assignableEmails", () => {
  it("is the owners plus added admins, once each, sorted", async () => {
    listAddedAdmins.mockResolvedValue([{ email: "shade@x.com" }, { email: "owner2@x.com" }]);
    expect(await store.assignableEmails()).toEqual(["joshua@x.com", "owner2@x.com", "shade@x.com"]);
  });
});

describe("reading tasks", () => {
  it("maps rows and keeps the due date as a calendar day", async () => {
    sql.mockResolvedValue([row]);
    const [task] = await store.listTasks();
    expect(task).toEqual({
      id: ID, title: "Flyers", notes: null, status: "todo", assigneeEmail: "shade@x.com", dueOn: "2026-10-09",
      createdBy: "joshua@x.com", createdAt: new Date("2026-10-01T15:00:00Z"), completedAt: null,
      lastRemindedAt: null, lastRemindedBy: null,
    });
    expect(text(sql.mock.calls[0])).toContain("due_on::text as due_on");
    expect(text(sql.mock.calls[0])).toMatch(/where status <> 'done' or completed_at > now\(\) - make_interval\(days => \?::int\)/);
    expect(sql.mock.calls[0]).toContain(14);
  });
  it("returns null for a malformed id without querying", async () => {
    expect(await store.getTask("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("createTask", () => {
  it("inserts only when the assignee may sign in", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await store.createTask(input, "joshua@x.com")).toEqual({ id: ID });
    const query = text(sql.mock.calls[0]);
    expect(query).toContain("insert into tasks");
    expect(query).toMatch(/where \?::text is null or \?::text = any\(\?::text\[\]\) or exists \(select 1 from admin_access where email = \?::text\)/);
    expect(sql.mock.calls[0]).toContainEqual(["joshua@x.com", "owner2@x.com"]);
  });
  it("reports a refused assignee", async () => {
    expect(await store.createTask(input, "joshua@x.com")).toBe("not-assignable");
  });
});

describe("updateTask", () => {
  it("returns the previous assignee from one statement", async () => {
    sql.mockResolvedValue([{ found: true, allowed: true, updated: true, previous_assignee: "joshua@x.com" }]);
    expect(await store.updateTask(ID, input)).toEqual({ previousAssignee: "joshua@x.com" });
    expect(sql).toHaveBeenCalledTimes(1);
    // Keeping a done task's assignee is allowed even after their access is gone.
    expect(text(sql.mock.calls[0])).toContain("is not distinct from (select assignee_email from prev)");
    // completed_at is kept when already done, stamped when entering done, cleared when leaving.
    expect(text(sql.mock.calls[0])).toContain("completed_at = case when ?::text = 'done' then case when status = 'done' then completed_at else now() end end");
  });
  it("reports missing and refused", async () => {
    sql.mockResolvedValueOnce([{ found: false, allowed: true, updated: false, previous_assignee: null }]);
    expect(await store.updateTask(ID, input)).toBe("missing");
    sql.mockResolvedValueOnce([{ found: true, allowed: false, updated: false, previous_assignee: null }]);
    expect(await store.updateTask(ID, input)).toBe("not-assignable");
    expect(await store.updateTask("nope", input)).toBe("missing");
  });
});

describe("claimReminder", () => {
  it("claims with the cooldown in the update's where clause", async () => {
    sql.mockResolvedValue([{ ...row, prev_status: "todo", prev_assignee: "shade@x.com", prev_at: null, prev_at_text: null, prev_by: null,
      last_reminded_at: "2026-10-01T17:42:00Z", last_reminded_by: "joshua@x.com", claimed_at: "2026-10-01 17:42:00.123456+00" }]);
    const result = await store.claimReminder(ID, "joshua@x.com");
    expect(result).toEqual({ claim: expect.objectContaining({ claimedAt: "2026-10-01 17:42:00.123456+00", previousAt: null, previousBy: null }) });
    const query = text(sql.mock.calls[0]);
    expect(query).toMatch(/last_reminded_at is null or last_reminded_at < now\(\) - make_interval\(mins => \?::int\)/);
    expect(query).toContain("assignee_email is not null and status <> 'done'");
    expect(sql.mock.calls[0]).toContain(10);
  });
  it("says why it refused", async () => {
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "missing", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "done", prev_assignee: "s@x.com", prev_at: null }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "done", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "todo", prev_assignee: null, prev_at: null }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "unassigned", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "todo", prev_assignee: "s@x.com", prev_at: "2026-10-01T17:40:00Z" }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "recent", lastAt: new Date("2026-10-01T17:40:00Z") });
  });
  it("releases only its own claim", async () => {
    await store.releaseReminder(ID, { task: {} as never, claimedAt: "C", previousAt: null, previousBy: null });
    expect(text(sql.mock.calls[0])).toContain("where id = ? and last_reminded_at = ?::timestamptz");
  });
});

describe("listDigestTasks", () => {
  it("selects open, assigned tasks due by the given day", async () => {
    await store.listDigestTasks("2026-10-02");
    expect(text(sql.mock.calls[0])).toMatch(/status <> 'done' and assignee_email is not null and due_on <= \?::date/);
    expect(sql.mock.calls[0]).toContain("2026-10-02");
  });
});

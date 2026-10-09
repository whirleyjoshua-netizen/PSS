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
  last_reminded_at: null, last_reminded_by: null, file_count: 2,
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
      lastRemindedAt: null, lastRemindedBy: null, fileCount: 2,
    });
    expect(text(sql.mock.calls[0])).toContain("due_on::text as due_on");
    expect(text(sql.mock.calls[0])).toContain("(select count(*) from task_files f where f.task_id = tasks.id)::int as file_count");
    expect(text(sql.mock.calls[0])).toMatch(/where status <> 'done' or completed_at > now\(\) - make_interval\(days => \?::int\)/);
    expect(sql.mock.calls[0]).toContain(14);
  });
  it("returns null for a malformed id without querying", async () => {
    expect(await store.getTask("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("createTask", () => {
  const FILE = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
  const RES = "5c4b3a29-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
  const files = {
    id: ID,
    uploads: [{ id: FILE, name: "Headlines.pdf", contentType: "application/pdf", sizeBytes: 900, pathname: `task-files/${ID}/${FILE}/Headlines.pdf` }],
    resourceIds: [RES],
  };

  it("writes the task with the form's id and its uploads and links in one statement, only when the assignee may sign in", async () => {
    sql.mockResolvedValue([{ existed: false, allowed: true, created: true, file_names: ["Headlines.pdf", "Price guide.pdf"] }]);
    expect(await store.createTask(input, "joshua@x.com", files)).toEqual({ id: ID, created: true, fileNames: ["Headlines.pdf", "Price guide.pdf"] });
    expect(sql).toHaveBeenCalledTimes(1);
    const query = text(sql.mock.calls[0]);
    expect(query).toContain("insert into tasks (id, title, notes, status, assignee_email, due_on, created_by, completed_at)");
    expect(query).toContain("on conflict (id) do nothing");
    expect(query).toMatch(/select \(\?::text is null or \?::text = any\(\?::text\[\]\) or exists \(select 1 from admin_access where email = \?::text\)\) as ok/);
    expect(query).toContain("where (select ok from allowed)");
    expect(query).toContain("from ins, jsonb_to_recordset(?::jsonb)");
    expect(query).toContain("from ins, unnest(?::uuid[]) as r(id)");
    expect(sql.mock.calls[0]).toContainEqual(["joshua@x.com", "owner2@x.com"]);
    expect(sql.mock.calls[0]).toContainEqual([RES]);
    expect(sql.mock.calls[0]).toContain(JSON.stringify([
      { id: FILE, name: "Headlines.pdf", content_type: "application/pdf", size_bytes: 900, blob_pathname: `task-files/${ID}/${FILE}/Headlines.pdf` },
    ]));
  });
  it("answers created: false with no file names when an earlier save took the id", async () => {
    sql.mockResolvedValue([{ existed: true, allowed: true, created: false, file_names: [] }]);
    expect(await store.createTask(input, "joshua@x.com", files)).toEqual({ id: ID, created: false, fileNames: [] });
  });
  it("reports a refused assignee", async () => {
    sql.mockResolvedValue([{ existed: false, allowed: false, created: false, file_names: [] }]);
    expect(await store.createTask(input, "joshua@x.com", files)).toBe("not-assignable");
  });
});

describe("deleteTask", () => {
  it("deletes the task and answers its uploads' storage paths, read in the same statement", async () => {
    sql.mockResolvedValue([{ deleted: true, paths: ["task-files/a", "task-files/b"] }]);
    expect(await store.deleteTask(ID)).toEqual(["task-files/a", "task-files/b"]);
    expect(sql).toHaveBeenCalledTimes(1);
    const query = text(sql.mock.calls[0]);
    expect(query).toContain("select blob_pathname from task_files where task_id = ? and blob_pathname is not null");
    expect(query).toContain("delete from tasks where id = ? returning id");
  });
  it("answers null when the task was already gone, and never queries for a malformed id", async () => {
    sql.mockResolvedValue([{ deleted: false, paths: [] }]);
    expect(await store.deleteTask(ID)).toBeNull();
    sql.mockClear();
    expect(await store.deleteTask("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
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
    // Deleted between the read and the write: allowed, but nothing was updated.
    sql.mockResolvedValueOnce([{ found: true, allowed: true, updated: false, previous_assignee: "shade@x.com" }]);
    expect(await store.updateTask(ID, input)).toBe("missing");
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
    // A refusal shows the previous time only when it is inside the cooldown.
    expect(query).toContain("p.last_reminded_at >= now() - make_interval(mins => ?::int) as prev_recent");
    expect(sql.mock.calls[0].filter((value: unknown) => value === 10)).toHaveLength(2);
  });
  it("says why it refused", async () => {
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "missing", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "done", prev_assignee: "s@x.com", prev_at: null }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "done", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "todo", prev_assignee: null, prev_at: null }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "unassigned", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "todo", prev_assignee: "s@x.com", prev_at: "2026-10-01T17:40:00Z", prev_recent: true }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "recent", lastAt: new Date("2026-10-01T17:40:00Z") });
    // A simultaneous press won: this statement saw an old time, which must not be shown.
    sql.mockResolvedValueOnce([{ id: null, prev_status: "todo", prev_assignee: "s@x.com", prev_at: "2026-09-30T09:00:00Z", prev_recent: false }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "recent", lastAt: null });
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

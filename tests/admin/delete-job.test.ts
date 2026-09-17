import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const put = vi.fn();
const get = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ put, get, del }));

const { deleteJob } = await import("@/lib/admin/jobs");
const { listBlobPathnames } = await import("@/lib/admin/files");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const CHILD = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const ACTOR = "owner@example.com";
const PATH_A = `jobs/${ID}/a-Quote.pdf`;
const PATH_B = `jobs/${ID}/b-Window.jpg`;

/** Classifies a statement so a test can answer, or record, the right step. */
const step = (s: string) =>
  /parent_job_id/.test(s) ? "children" : /blob_pathname/.test(s) ? "pathnames" : /delete\s+from\s+leads/i.test(s) ? "delete" : "other";

beforeEach(() => {
  sql.mockReset();
  del.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** No child, two files, the row deleted. The happy path every test below varies from. */
function happyPath() {
  sql.mockImplementation(async (strings: TemplateStringsArray) => {
    switch (step(strings.join("?"))) {
      case "children": return [];
      case "pathnames": return [{ blob_pathname: PATH_A }, { blob_pathname: PATH_B }];
      case "delete": return [{ id: ID }];
      default: return [];
    }
  });
}

describe("listBlobPathnames", () => {
  it("names the column it selects, for one job's files", async () => {
    sql.mockResolvedValue([{ blob_pathname: PATH_A }, { blob_pathname: PATH_B }]);
    await expect(listBlobPathnames(ID)).resolves.toEqual([PATH_A, PATH_B]);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("select blob_pathname");
    expect(statement).not.toContain("select *");
    expect(sql.mock.calls[0].slice(1)).toContain(ID);
  });

  it("returns nothing, and asks the database nothing, for an id that is not a uuid", async () => {
    await expect(listBlobPathnames("../etc/passwd")).resolves.toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("deleteJob", () => {
  it("refuses a job that has a service request, and deletes nothing", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      step(strings.join("?")) === "children" ? [{ id: CHILD }] : [],
    );

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("has-children");

    const statements = sql.mock.calls.map((c) => text(c));
    expect(statements.some((s) => /delete\s+from\s+leads/i.test(s))).toBe(false);
    expect(statements.some((s) => /blob_pathname/.test(s))).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it("reads the blob pathnames before the row is deleted, and removes the blobs after", async () => {
    const order: string[] = [];
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const which = step(strings.join("?"));
      order.push(which);
      switch (which) {
        case "children": return [];
        case "pathnames": return [{ blob_pathname: PATH_A }, { blob_pathname: PATH_B }];
        case "delete": return [{ id: ID }];
        default: return [];
      }
    });
    del.mockImplementation(async () => { order.push("blob"); });

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");

    // The order IS the assertion: a pathname read after the delete would find nothing,
    // and a blob removed before it would strand a job whose files were already gone.
    expect(order).toEqual(["children", "pathnames", "delete", "blob", "blob"]);
    expect(del.mock.calls.map(([p]) => p)).toEqual([PATH_A, PATH_B]);
  });

  it("deletes the row in one statement, bound to the id", async () => {
    happyPath();

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");

    const deletes = sql.mock.calls.filter((c) => /delete\s+from\s+leads/i.test(text(c)));
    expect(deletes).toHaveLength(1);
    expect(text(deletes[0])).toContain("where id = ?");
    expect(deletes[0].slice(1)).toContain(ID);
  });

  it("still reports deleted when a blob removal rejects, and removes the rest", async () => {
    happyPath();
    del.mockRejectedValueOnce(new Error("blob down"));

    // The row is already gone. Telling the owner it failed would be a lie.
    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");
    expect(del).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("reports missing when the row was already gone, and removes no blobs", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      step(strings.join("?")) === "pathnames" ? [{ blob_pathname: PATH_A }] : [],
    );

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("missing");
    expect(del).not.toHaveBeenCalled();
  });

  it("reports missing for an id that is not a uuid, without touching the database", async () => {
    await expect(deleteJob("not-a-uuid", ACTOR)).resolves.toBe("missing");
    expect(sql).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const put = vi.fn();
const get = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ put, get, del }));
// The Graph boundary is mocked, not the removal itself: these tests run the real
// lib/calendar/remove, so "Outlook is not configured" is exercised for real.
const graphFetch = vi.fn();
vi.mock("@/lib/calendar/graph", async () => {
  const real = await vi.importActual<typeof import("@/lib/calendar/graph")>("@/lib/calendar/graph");
  return { ...real, graphFetch };
});
const enabled = vi.fn(() => true);
vi.mock("@/lib/calendar/config", () => ({
  calendarEnabled: () => enabled(),
  calendarConfig: () => (enabled() ? { mailbox: "jobs@example.com" } : null),
}));

const { deleteJob } = await import("@/lib/admin/jobs");
const { listBlobPathnames } = await import("@/lib/admin/files");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const CHILD = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const ACTOR = "owner@example.com";
const PATH_A = `jobs/${ID}/a-Quote.pdf`;
const PATH_B = `jobs/${ID}/b-Window.jpg`;
const EVENT = "AAMkAGI1event";

/** Classifies a statement so a test can answer, or record, the right step. */
const step = (s: string) =>
  /parent_job_id/.test(s) ? "children"
    : /blob_pathname/.test(s) ? "pathnames"
    : /job_calendar_events/.test(s) ? "events"
    : /delete\s+from\s+leads/i.test(s) ? "delete" : "other";

beforeEach(() => {
  sql.mockReset();
  del.mockReset().mockResolvedValue(undefined);
  graphFetch.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  enabled.mockReturnValue(true);
  // Reset, not just re-spy: the spy is one object across the file, so its calls would otherwise carry over.
  vi.spyOn(console, "error").mockReset().mockImplementation(() => {});
});

/** No child, two files, one Outlook event, the row deleted. The happy path every test below varies from. */
function happyPath() {
  sql.mockImplementation(async (strings: TemplateStringsArray) => {
    switch (step(strings.join("?"))) {
      case "children": return [];
      case "pathnames": return [{ blob_pathname: PATH_A }, { blob_pathname: PATH_B }];
      case "events": return [{ event_id: EVENT }];
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

  it("also names the job's drawn signature images, which have no job_files row", async () => {
    sql.mockResolvedValue([{ blob_pathname: PATH_A }, { blob_pathname: `jobs/${ID}/signatures/u-signature.png` }]);
    await expect(listBlobPathnames(ID)).resolves.toEqual([PATH_A, `jobs/${ID}/signatures/u-signature.png`]);
    const statement = text(sql.mock.calls[0]).replace(/\s+/g, " ");
    expect(statement).toContain("from contract_signatures s");
    expect(statement).toContain("unnest(array[s.signature_image_pathname, s.initials_image_pathname])");
    expect(statement).toContain("p is not null");
    // Both halves are limited to this job.
    expect(sql.mock.calls[0].slice(1)).toEqual([ID, ID]);
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
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("reads the blob pathnames and the Outlook event ids before the row is deleted, and removes them after", async () => {
    const order: string[] = [];
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const which = step(strings.join("?"));
      order.push(which);
      switch (which) {
        case "children": return [];
        case "pathnames": return [{ blob_pathname: PATH_A }, { blob_pathname: PATH_B }];
        case "events": return [{ event_id: EVENT }];
        case "delete": return [{ id: ID }];
        default: return [];
      }
    });
    del.mockImplementation(async () => { order.push("blob"); });
    graphFetch.mockImplementation(async () => { order.push("event"); return new Response(null, { status: 204 }); });

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");

    // The order IS the assertion: a pathname or an event id read after the delete would find
    // nothing (both tables cascade), a blob removed before it would strand a job whose files
    // were already gone, and an event removed before it would strand a live job whose
    // appointment had vanished from the owners' shared calendar.
    expect(order).toEqual(["children", "pathnames", "events", "delete", "blob", "blob", "event"]);
    expect(del.mock.calls.map(([p]) => p)).toEqual([PATH_A, PATH_B]);
    expect(graphFetch.mock.calls[0]).toEqual([
      `users/jobs@example.com/events/${encodeURIComponent(EVENT)}`, { method: "DELETE" },
    ]);
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

  it("still reports deleted when the Outlook removal fails, and says so in the log", async () => {
    happyPath();
    graphFetch.mockResolvedValue(new Response(null, { status: 500 }));

    // The job is gone whatever Outlook says; a phantom event is a log line, not a failed deletion.
    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");
    expect(console.error).toHaveBeenCalled();
  });

  it("still reports deleted when the Graph call itself rejects", async () => {
    happyPath();
    graphFetch.mockRejectedValue(new Error("network down"));

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");
    expect(console.error).toHaveBeenCalled();
  });

  it("asks Outlook nothing for a job that has no calendar event", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      switch (step(strings.join("?"))) {
        case "delete": return [{ id: ID }];
        default: return [];
      }
    });

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("deletes cleanly, and calls no Graph API, when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    happyPath();

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("deleted");
    expect(graphFetch).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("reports missing when the row was already gone, and removes no blobs or events", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      step(strings.join("?")) === "pathnames" ? [{ blob_pathname: PATH_A }]
        : step(strings.join("?")) === "events" ? [{ event_id: EVENT }] : [],
    );

    await expect(deleteJob(ID, ACTOR)).resolves.toBe("missing");
    expect(del).not.toHaveBeenCalled();
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("reports missing for an id that is not a uuid, without touching the database", async () => {
    await expect(deleteJob("not-a-uuid", ACTOR)).resolves.toBe("missing");
    expect(sql).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(graphFetch).not.toHaveBeenCalled();
  });
});

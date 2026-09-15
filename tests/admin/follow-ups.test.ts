import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { clearFollowUp, listDueFollowUps, setFollowUp } = await import("@/lib/admin/follow-ups");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
beforeEach(() => { query.mockReset().mockResolvedValue([{ id: "e1" }]); });

describe("setFollowUp", () => {
  it("sets the follow-up and logs it in one statement", async () => {
    const at = new Date("2026-10-16T17:00:00Z");
    expect(await setFollowUp(JOB, at, "checking with husband", "owner@example.com")).toBe(true);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("follow_up_at = $2");
    expect(text).toContain("insert into job_events");
    expect(params).toEqual([JOB, at, "checking with husband", "owner@example.com",
      "Follow-up set: Fri 10/16, 10:00 AM · checking with husband"]);
  });
  it("returns false for a missing job or a bad id", async () => {
    query.mockResolvedValue([]);
    expect(await setFollowUp(JOB, new Date(), null, "o")).toBe(false);
    query.mockClear();
    expect(await setFollowUp("nope", new Date(), null, "o")).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("clearFollowUp", () => {
  it("clears only a set follow-up and logs Follow-up done", async () => {
    expect(await clearFollowUp(JOB, "owner@example.com")).toBe(true);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("follow_up_at is not null");
    expect(text).toContain("follow_up_at = null");
    expect(params).toEqual([JOB, "owner@example.com", "Follow-up done"]);
  });
});

describe("listDueFollowUps", () => {
  it("lists jobs not lost, due before the end of today, soonest first", async () => {
    query.mockResolvedValue([]);
    const now = new Date("2026-10-14T20:00:00Z");
    await listDueFollowUps(now);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("follow_up_at is not null");
    expect(text).toContain("status <> 'lost'");
    expect(text).toContain("follow_up_at < $1");
    expect(text).toContain("order by follow_up_at asc");
    expect(params).toEqual([new Date("2026-10-15T07:00:00Z")]);
  });
});

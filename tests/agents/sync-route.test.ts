// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const store = { findAgentByKeyHash: vi.fn(), upsertItem: vi.fn(), recordRun: vi.fn(), pullUpdates: vi.fn(), pullReplies: vi.fn() };
vi.mock("@/lib/agents/store", () => store);
const businessCounts = vi.fn();
vi.mock("@/lib/agents/stats", () => ({ businessCounts }));
const pollReplies = vi.fn();
vi.mock("@/lib/agents/mail", () => ({ pollReplies }));
const { GET, POST } = await import("@/app/api/agents/sync/route");
const { hashKey, newAgentKey } = await import("@/lib/agents/rules");

const KEY = newAgentKey();
const tara = { slug: "tara", name: "Tara", statsAccess: true };
const req = (method: string, body?: unknown, key: string | null = KEY) =>
  new Request("https://pss.test/api/agents/sync", {
    method, headers: key ? { authorization: `Bearer ${key}`, "content-type": "application/json" } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset();
  store.findAgentByKeyHash.mockImplementation(async (h: string) => (h === hashKey(KEY) ? tara : null));
  store.pullUpdates.mockResolvedValue([]); store.pullReplies.mockResolvedValue([]);
  businessCounts.mockReset().mockResolvedValue({ leads: 1 }); pollReplies.mockReset().mockResolvedValue({ stored: 0 });
});

describe("auth", () => {
  it("401s with no key, a wrong key, or a malformed header, and reads nothing", async () => {
    for (const r of [req("GET", undefined, null), req("GET", undefined, newAgentKey())]) expect((await GET(r)).status).toBe(401);
    expect((await POST(new Request("https://pss.test/x", { method: "POST", headers: { authorization: "Basic abc" } }))).status).toBe(401);
    expect(store.pullUpdates).not.toHaveBeenCalled();
    expect(store.pullReplies).not.toHaveBeenCalled();
    expect(pollReplies).not.toHaveBeenCalled();
    expect(businessCounts).not.toHaveBeenCalled();
    expect(store.upsertItem).not.toHaveBeenCalled();
    expect(store.recordRun).not.toHaveBeenCalled();
  });
  it("401s a wrong key on POST before storing anything", async () => {
    const res = await POST(req("POST", { run: { status: "ok" }, items: [{ kind: "report", external_id: "r1", title: "x", report_type: "daily", body_md: "x" }] }, newAgentKey()));
    expect(res.status).toBe(401);
    expect(store.upsertItem).not.toHaveBeenCalled();
    expect(store.recordRun).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("pulls this agent's updates and replies, with stats when allowed", async () => {
    store.pullUpdates.mockResolvedValue([{ externalId: "A-001", kind: "decision", status: "approved", ownerNote: "yes", finalTo: null, finalSubject: null, finalBody: null, decidedAt: new Date("2026-10-09T16:00:00Z"), sentAt: null, error: null }]);
    const reply = { external_id: "e1", from: "a@b.co", received_at: "2026-10-09T17:00:00.000Z", subject: "Re: x", body_text: "sure" };
    store.pullReplies.mockResolvedValue([reply]);
    const res = await GET(req("GET"));
    const body = await res.json();
    expect(store.pullUpdates).toHaveBeenCalledWith("tara");
    expect(store.pullReplies).toHaveBeenCalledWith("tara");
    expect(body.agent).toBe("tara");
    expect(typeof body.now).toBe("string");
    expect(body.updates[0]).toEqual({
      external_id: "A-001", kind: "decision", status: "approved", owner_note: "yes", final_to: null, final_subject: null,
      final_body: null, decided_at: "2026-10-09T16:00:00.000Z", sent_at: null, error: null,
    });
    expect(body.replies).toEqual([reply]);
    expect(body.stats).toEqual({ last_7: { leads: 1 }, last_28: { leads: 1 } });
    expect(businessCounts).toHaveBeenCalledWith(7);
    expect(businessCounts).toHaveBeenCalledWith(28);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("gives no stats to an agent without stats access", async () => {
    store.findAgentByKeyHash.mockResolvedValue({ ...tara, slug: "tobi", statsAccess: false });
    expect((await (await GET(req("GET"))).json()).stats).toBeNull();
    expect(businessCounts).not.toHaveBeenCalled();
  });
  it("still answers when reply polling fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    pollReplies.mockRejectedValue(new Error("graph down"));
    expect((await GET(req("GET"))).status).toBe(200);
  });
});

describe("POST", () => {
  it("stores valid items, reports invalid ones per item, and records the run", async () => {
    store.upsertItem.mockResolvedValue("created");
    const res = await POST(req("POST", { run: { status: "ok", note: "fine" }, items: [
      { kind: "report", external_id: "r1", title: "Daily", report_type: "daily", body_md: "# x" },
      { kind: "email", external_id: "e1", title: "x", email_to: "a@b.co, c@d.co", email_subject: "s", email_body: "b" },
    ] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { results } = await res.json();
    expect(results[0]).toEqual({ external_id: "r1", result: "created" });
    expect(results[1]).toMatchObject({ external_id: "e1" });
    expect(results[1].result).toMatch(/^invalid:/);
    expect(store.upsertItem).toHaveBeenCalledTimes(1);
    expect(store.upsertItem).toHaveBeenCalledWith("tara", expect.objectContaining({ external_id: "r1", kind: "report" }));
    expect(store.recordRun).toHaveBeenCalledWith("tara", "ok", "fine");
  });
  it("labels an item with no usable external_id as ? and records no run when none is sent", async () => {
    const res = await POST(req("POST", { items: [{ kind: "report" }] }));
    expect((await res.json()).results).toEqual([{ external_id: "?", result: expect.stringMatching(/^invalid:/) }]);
    expect(store.recordRun).not.toHaveBeenCalled();
  });
  it("400s on a body that isn't JSON or has 51 items", async () => {
    const bad = new Request("https://pss.test/api/agents/sync", { method: "POST", headers: { authorization: `Bearer ${KEY}` }, body: "{" });
    expect((await POST(bad)).status).toBe(400);
    expect((await POST(req("POST", { items: Array(51).fill({}) }))).status).toBe(400);
    expect(store.upsertItem).not.toHaveBeenCalled();
    expect(store.recordRun).not.toHaveBeenCalled();
  });
});

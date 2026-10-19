// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const store = { columnKeyMatches: vi.fn(), listLeadsPage: vi.fn(), unsubscribeTokens: vi.fn(), suppressedAddresses: vi.fn(), addressForToken: vi.fn() };
vi.mock("@/lib/column/store", () => store);
const addSuppression = vi.fn();
vi.mock("@/lib/agents/store", () => ({ addSuppression }));
const leads = await import("@/app/api/column/leads/route");
const email = await import("@/app/api/column/email/route");
const unsubscribe = await import("@/app/api/unsubscribe/[token]/route");
const { hashKey, newAgentKey } = await import("@/lib/agents/rules");

const KEY = newAgentKey();
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const TOKEN = "a".repeat(32);
const req = (path: string, init: RequestInit = {}, key: string | null = KEY) =>
  new Request(`https://pss.test${path}`, { ...init, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" } });
const lead = (over: Record<string, unknown> = {}) => ({
  id: ID, name: "Pat Lee", email: " Pat@Example.com ", phone: "702-555-0100", address: null, city: "Henderson", source: "contact",
  stage: "quoted", lostReason: null, assignedTo: "Sam", suppressed: false, createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: null, stageChangedAt: new Date("2026-10-05T10:00:00Z"), ...over,
});
const tokenParams = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset();
  addSuppression.mockReset();
  store.columnKeyMatches.mockImplementation(async (h: string) => h === hashKey(KEY));
  store.listLeadsPage.mockResolvedValue([]);
  store.unsubscribeTokens.mockResolvedValue(new Map());
});

describe("auth", () => {
  it("refuses a missing, wrong or malformed key before reading anything", async () => {
    for (const r of [req("/api/column/leads", {}, null), req("/api/column/leads", {}, newAgentKey())]) expect((await leads.GET(r)).status).toBe(401);
    expect((await email.GET(new Request("https://pss.test/api/column/email", { headers: { authorization: "Basic abc" } }))).status).toBe(401);
    expect((await email.POST(req("/api/column/email", { method: "POST", body: "{}" }, newAgentKey()))).status).toBe(401);
    expect(store.listLeadsPage).not.toHaveBeenCalled();
    expect(store.suppressedAddresses).not.toHaveBeenCalled();
    expect(store.unsubscribeTokens).not.toHaveBeenCalled();
  });
});

describe("GET /api/column/leads", () => {
  it("returns a page of leads with each one's unsubscribe link, and where the next page starts", async () => {
    store.listLeadsPage.mockResolvedValue([lead(), lead({ id: "4f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", email: null })]);
    store.unsubscribeTokens.mockResolvedValue(new Map([["pat@example.com", TOKEN]]));
    const res = await leads.GET(req("/api/column/leads?limit=2"));
    const body = await res.json();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(store.listLeadsPage).toHaveBeenCalledWith(null, 2);
    expect(store.unsubscribeTokens).toHaveBeenCalledWith([" Pat@Example.com "]);
    expect(body.leads[0]).toMatchObject({ id: ID, stage: "quoted", assigned_to: "Sam", do_not_email: false, unsubscribe_url: `https://premiershadesolutions.com/unsubscribe/${TOKEN}` });
    expect(body.leads[1].unsubscribe_url).toBeNull();
    expect(body.next).toBe("4f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
  });
  it("says there's no next page when a page comes back short, and passes the cursor on", async () => {
    store.listLeadsPage.mockResolvedValue([lead()]);
    const body = await (await leads.GET(req(`/api/column/leads?after=${ID}`))).json();
    expect(store.listLeadsPage).toHaveBeenCalledWith(ID, 500);
    expect(body.next).toBeNull();
  });
  it("refuses a cursor that isn't a lead id, or a limit out of range", async () => {
    expect((await leads.GET(req("/api/column/leads?after=1;drop"))).status).toBe(400);
    expect((await leads.GET(req("/api/column/leads?limit=5000"))).status).toBe(400);
    expect(store.listLeadsPage).not.toHaveBeenCalled();
  });
});

describe("/api/column/email", () => {
  it("GET returns the do-not-contact list", async () => {
    store.suppressedAddresses.mockResolvedValue(["no@example.com"]);
    expect(await (await email.GET(req("/api/column/email"))).json()).toEqual({ do_not_email: ["no@example.com"] });
  });
  it("POST returns an unsubscribe link for each address, lowercased", async () => {
    store.unsubscribeTokens.mockResolvedValue(new Map([["pat@example.com", TOKEN]]));
    const res = await email.POST(req("/api/column/email", { method: "POST", body: JSON.stringify({ emails: ["Pat@Example.com"] }) }));
    expect(store.unsubscribeTokens).toHaveBeenCalledWith(["pat@example.com"]);
    expect(await res.json()).toEqual({ unsubscribe_urls: { "pat@example.com": `https://premiershadesolutions.com/unsubscribe/${TOKEN}` } });
  });
  it("POST refuses a body that isn't a list of addresses", async () => {
    for (const body of ["nope", JSON.stringify({ emails: ["not an address"] }), JSON.stringify({ emails: Array(1001).fill("a@b.co") })]) {
      expect((await email.POST(req("/api/column/email", { method: "POST", body }))).status).toBe(400);
    }
    expect(store.unsubscribeTokens).not.toHaveBeenCalled();
  });
});

describe("POST /api/unsubscribe/[token]", () => {
  it("adds the token's address to the do-not-contact list", async () => {
    store.addressForToken.mockResolvedValue("pat@example.com");
    const res = await unsubscribe.POST(new Request("https://pss.test/x", { method: "POST" }), tokenParams(TOKEN));
    expect(res.status).toBe(204);
    expect(addSuppression).toHaveBeenCalledWith("pat@example.com", "Unsubscribed from an email", "link");
  });
  it("answers the same for an unknown or malformed token, and adds nothing", async () => {
    store.addressForToken.mockResolvedValue(null);
    expect((await unsubscribe.POST(new Request("https://pss.test/x", { method: "POST" }), tokenParams(TOKEN))).status).toBe(204);
    expect((await unsubscribe.POST(new Request("https://pss.test/x", { method: "POST" }), tokenParams("../x"))).status).toBe(204);
    expect(store.addressForToken).toHaveBeenCalledTimes(1);
    expect(addSuppression).not.toHaveBeenCalled();
  });
});

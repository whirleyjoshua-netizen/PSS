import { describe, it, expect, vi, beforeEach } from "vitest";

const store = {
  getCalendarJob: vi.fn(), getLinks: vi.fn(), getLinkByEvent: vi.fn(), saveLink: vi.fn(), deleteLink: vi.fn(),
  setJobDate: vi.fn(), recordError: vi.fn(), clearError: vi.fn(), reconcileTargets: vi.fn(),
};
vi.mock("@/lib/calendar/store", () => store);
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
vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.example" }));

const sync = await import("@/lib/calendar/sync");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const PST = "Pacific Standard Time";
const job = {
  id: ID, name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [],
  status: "visit_booked", visitAt: new Date("2026-09-20T17:00:00Z"), installOn: null,
};
const event = (over: Record<string, unknown> = {}) => ({
  id: "e1", changeKey: "ck1", isAllDay: false,
  start: { dateTime: "2026-09-20T10:00:00.0000000", timeZone: PST },
  end: { dateTime: "2026-09-20T11:00:00.0000000", timeZone: PST }, ...over,
});
const link = { leadId: ID, kind: "visit", eventId: "e1", changeKey: "ck1" };
const calls = () => graphFetch.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`);

beforeEach(() => {
  Object.values(store).forEach((fn) => fn.mockReset());
  graphFetch.mockReset();
  enabled.mockReturnValue(true);
  store.getCalendarJob.mockResolvedValue(job);
  store.getLinks.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncJobCalendar (tracker wins)", () => {
  it("creates an event for a new date and stores the link", async () => {
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["POST users/jobs@example.com/events"]);
    expect(graphFetch.mock.calls[0][1].body.subject).toBe("Visit · Dana Reyes");
    expect(graphFetch.mock.calls[0][1].body.body.content).toContain(`https://pss.example/admin?job=${ID}`);
    expect(store.saveLink).toHaveBeenCalledWith(link);
  });

  it("patches a moved visit, keeping its length, and stores the new changeKey", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue({ ...job, visitAt: new Date("2026-09-21T16:00:00Z") });
    graphFetch
      .mockResolvedValueOnce(Response.json(event({ end: { dateTime: "2026-09-20T11:30:00.0000000", timeZone: PST } })))
      .mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1", "PATCH users/jobs@example.com/events/e1"]);
    expect(graphFetch.mock.calls[1][1].body.end.dateTime).toBe("2026-09-21T10:30:00");
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2" });
  });

  it("does nothing when Outlook already matches", async () => {
    store.getLinks.mockResolvedValue([link]);
    graphFetch.mockResolvedValueOnce(Response.json(event()));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("deletes the event when the date is cleared or the job is lost", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue({ ...job, status: "lost" });
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toContain("DELETE users/jobs@example.com/events/e1");
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "visit");
  });

  it("re-creates an event Outlook no longer has", async () => {
    store.getLinks.mockResolvedValue([link]);
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: "e9", changeKey: "ck9" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "visit");
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, eventId: "e9", changeKey: "ck9" });
    expect(store.setJobDate).not.toHaveBeenCalled();
  });

  it("records a Graph failure and never throws", async () => {
    graphFetch.mockResolvedValue(new Response("down", { status: 500 }));
    await expect(sync.syncJobCalendar(ID)).resolves.toBeUndefined();
    expect(store.recordError).toHaveBeenCalledWith(expect.stringMatching(/500/));
  });

  it("does nothing when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    await sync.syncJobCalendar(ID);
    expect(graphFetch).not.toHaveBeenCalled();
    expect(store.getCalendarJob).not.toHaveBeenCalled();
  });

  it("creates an all-day install", async () => {
    store.getCalendarJob.mockResolvedValue({ ...job, visitAt: null, installOn: "2026-10-02" });
    graphFetch.mockResolvedValue(Response.json({ id: "e2", changeKey: "c" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(graphFetch.mock.calls[0][1].body.isAllDay).toBe(true);
    expect(store.saveLink).toHaveBeenCalledWith({ leadId: ID, kind: "install", eventId: "e2", changeKey: "c" });
  });
});

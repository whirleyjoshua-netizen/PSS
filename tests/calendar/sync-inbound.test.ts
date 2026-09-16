import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store = {
  getCalendarJob: vi.fn(), getLinks: vi.fn(), getLinkByEvent: vi.fn(), saveLink: vi.fn(), deleteLink: vi.fn(), claimLink: vi.fn(),
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
const appt = (kind: string, startsAt: Date, allDay = false) => ({ kind, startsAt, allDay });
const jobWith = (...appointments: ReturnType<typeof appt>[]) => ({
  id: ID, name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [],
  status: "visit_booked", visitAt: null, installOn: null, appointments,
});
const job = jobWith(appt("consultation", new Date("2026-09-20T17:00:00Z")));
// Graph's GET sends no $select, so a real event always comes back with its subject.
const event = (over: Record<string, unknown> = {}) => ({
  id: "e1", changeKey: "ck1", isAllDay: false, subject: "Consultation · Dana Reyes",
  start: { dateTime: "2026-09-20T10:00:00.0000000", timeZone: PST },
  end: { dateTime: "2026-09-20T11:00:00.0000000", timeZone: PST }, ...over,
});
const link = { leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck1" };
const calls = () => graphFetch.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`);

beforeEach(() => {
  Object.values(store).forEach((fn) => fn.mockReset());
  graphFetch.mockReset();
  enabled.mockReturnValue(true);
  store.getCalendarJob.mockResolvedValue(job);
  store.getLinks.mockResolvedValue([]);
  store.claimLink.mockResolvedValue("pending:new");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T19:00:00Z")); // noon in Las Vegas, before the fixtures' dates
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => { vi.useRealTimers(); });

describe("applyOutlookChange (Outlook wins when its changeKey moved)", () => {
  beforeEach(() => { store.getLinkByEvent.mockResolvedValue(link); store.getLinks.mockResolvedValue([link]); });

  it("moves the job's consultation to the time set in Outlook and logs it", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event({
      changeKey: "ck2", start: { dateTime: "2026-09-22T14:00:00.0000000", timeZone: PST },
      end: { dateTime: "2026-09-22T15:00:00.0000000", timeZone: PST },
    })));
    await sync.applyOutlookChange("e1");
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "consultation", new Date("2026-09-22T21:00:00Z"),
      expect.stringMatching(/^Consultation moved in Outlook to Tue, Sep 22/));
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2" });
    expect(calls()).not.toContain("PATCH users/jobs@example.com/events/e1");
  });

  it("applies an edit to a measure, because every linked kind is read back", async () => {
    const measureLink = { ...link, kind: "measure", eventId: "e3" };
    store.getLinkByEvent.mockResolvedValue(measureLink);
    store.getLinks.mockResolvedValue([measureLink]);
    store.getCalendarJob.mockResolvedValue(jobWith(appt("measure", new Date("2026-09-20T17:00:00Z"))));
    graphFetch.mockResolvedValueOnce(Response.json(event({
      id: "e3", changeKey: "ck2", start: { dateTime: "2026-09-22T14:00:00.0000000", timeZone: PST },
      end: { dateTime: "2026-09-22T15:00:00.0000000", timeZone: PST },
    })));
    await sync.applyOutlookChange("e3");
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "measure", new Date("2026-09-22T21:00:00Z"),
      expect.stringMatching(/^Measure moved in Outlook to Tue, Sep 22/));
  });

  it("ignores its own write echoing back (same changeKey)", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event()));
    await sync.applyOutlookChange("e1");
    expect(store.setJobDate).not.toHaveBeenCalled();
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("stores the new changeKey but keeps the date for a text-only edit", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck3", subject: "Consultation · Dana (gate code 1234)" })));
    await sync.applyOutlookChange("e1");
    expect(store.setJobDate).not.toHaveBeenCalled();
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck3" });
  });

  it("clears the consultation when the event was deleted in Outlook", async () => {
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await sync.applyOutlookChange("e1");
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "e1");
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "consultation", null, "Consultation removed in Outlook");
  });

  it("keeps a past timed appointment when Outlook no longer has its event, and only drops the link", async () => {
    store.getCalendarJob.mockResolvedValue(jobWith(appt("consultation", new Date("2026-09-14T15:00:00Z")))); // 8 AM today
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await sync.applyOutlookChange("e1");
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "e1");
    expect(store.setJobDate).not.toHaveBeenCalled();
  });

  it("keeps a past all-day install (before today in Las Vegas) when its event is gone", async () => {
    const installLink = { ...link, kind: "install", eventId: "e2" };
    store.getLinkByEvent.mockResolvedValue(installLink);
    store.getLinks.mockResolvedValue([installLink]);
    store.getCalendarJob.mockResolvedValue(jobWith(appt("install", new Date("2026-09-13T15:00:00Z"), true)));
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await sync.applyOutlookChange("e2");
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "install", "e2");
    expect(store.setJobDate).not.toHaveBeenCalled();
  });

  it("still clears today's all-day install when its event is deleted in Outlook", async () => {
    const installLink = { ...link, kind: "install", eventId: "e2" };
    store.getLinkByEvent.mockResolvedValue(installLink);
    store.getLinks.mockResolvedValue([installLink]);
    store.getCalendarJob.mockResolvedValue(jobWith(appt("install", new Date("2026-09-14T15:00:00Z"), true)));
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await sync.applyOutlookChange("e2");
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "install", null, "Install removed in Outlook");
  });

  it("ignores Outlook events that are not job events", async () => {
    store.getLinkByEvent.mockResolvedValue(null);
    await sync.applyOutlookChange("other");
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("records a failure instead of throwing", async () => {
    graphFetch.mockResolvedValue(new Response("x", { status: 500 }));
    await expect(sync.applyOutlookChange("e1")).resolves.toBeUndefined();
    expect(store.recordError).toHaveBeenCalled();
  });
});

describe("reconcileCalendar", () => {
  it("pushes a date whose earlier sync failed (same changeKey, different date)", async () => {
    store.reconcileTargets.mockResolvedValue([ID]);
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue(jobWith(appt("consultation", new Date("2026-09-21T16:00:00Z"))));
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ changeKey: "ck2" }));
    expect(await sync.reconcileCalendar({ clearErrorWhenClean: true })).toEqual({ jobs: 1, failed: 0 });
    expect(calls()).toContain("PATCH users/jobs@example.com/events/e1");
    expect(store.clearError).toHaveBeenCalled();
  });

  it("leaves a recorded error alone after a clean run unless asked to clear it", async () => {
    store.reconcileTargets.mockResolvedValue([ID]);
    store.getLinks.mockResolvedValue([link]);
    graphFetch.mockResolvedValueOnce(Response.json(event()));
    expect(await sync.reconcileCalendar()).toEqual({ jobs: 1, failed: 0 });
    expect(store.clearError).not.toHaveBeenCalled();
  });

  it("creates events for dated jobs that have none", async () => {
    store.reconcileTargets.mockResolvedValue([ID]);
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.reconcileCalendar();
    expect(store.saveLink).toHaveBeenCalledWith(link);
  });

  it("keeps going after one job fails and does not clear the error", async () => {
    const ID_B = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
    store.reconcileTargets.mockResolvedValue([ID, ID_B]);
    graphFetch.mockResolvedValueOnce(new Response("x", { status: 500 }))
      .mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    expect(await sync.reconcileCalendar()).toEqual({ jobs: 2, failed: 1 });
    expect(store.recordError).toHaveBeenCalledTimes(1);
    expect(store.clearError).not.toHaveBeenCalled();
  });
});

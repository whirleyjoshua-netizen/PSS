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
const { bodyHash, eventSubject, eventText } = await import("@/lib/calendar/events");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const PST = "Pacific Standard Time";
const CONSULT_AT = new Date("2026-09-20T17:00:00Z"); // 10:00 AM in Las Vegas
/** Only confirmed appointments ever reach the sync; the store filters the rest out. */
const appt = (kind: string, startsAt: Date, allDay = false, designerNotes: string | null = null) =>
  ({ kind, startsAt, allDay, designerNotes });
const jobWith = (...appointments: ReturnType<typeof appt>[]) => ({
  id: ID, name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [],
  gateCode: null as string | null, status: "visit_booked", visitAt: null, installOn: null, appointments,
});
const job = jobWith(appt("consultation", CONSULT_AT));
const JOB_URL = `https://pss.example/admin/jobs/${ID}`;
/** The hash of the body this job's events carry with no gate code and no notes: what an up-to-date link holds. */
const HASH = bodyHash(eventText(job, null, JOB_URL));
// Graph's GET sends no $select, so a real event always comes back with its subject.
const event = (over: Record<string, unknown> = {}) => ({
  id: "e1", changeKey: "ck1", isAllDay: false, subject: "Consultation · Dana Reyes",
  start: { dateTime: "2026-09-20T10:00:00.0000000", timeZone: PST },
  end: { dateTime: "2026-09-20T11:00:00.0000000", timeZone: PST }, ...over,
});
const link = { leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck1", bodyHash: HASH };
const calls = () => graphFetch.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`);
const subjects = () => graphFetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => init.body.subject);

// The fixtures are fixed dates, and sync treats a past date as history; pin "now" before them
// so the suite doesn't change meaning as the calendar moves on. Only Date is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  Object.values(store).forEach((fn) => fn.mockReset());
  graphFetch.mockReset();
  enabled.mockReturnValue(true);
  store.getCalendarJob.mockResolvedValue(job);
  store.getLinks.mockResolvedValue([]);
  store.claimLink.mockResolvedValue("pending:new");
  store.deleteLink.mockResolvedValue(undefined); // async like the real store
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("every appointment kind", () => {
  it("creates one event per confirmed appointment, each with its own subject", async () => {
    store.getCalendarJob.mockResolvedValue(jobWith(
      appt("consultation", CONSULT_AT), appt("measure", CONSULT_AT),
      appt("install", new Date("2026-10-02T15:00:00Z"), true), appt("service", CONSULT_AT),
    ));
    // A fresh Response per call: a body can only be read once, and there are four creates here.
    graphFetch.mockImplementation(async () => Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(subjects()).toEqual([
      "Consultation · Dana Reyes", "Measure · Dana Reyes", "Install · Dana Reyes", "Service · Dana Reyes",
    ]);
    expect(store.claimLink.mock.calls.map(([, kind]) => kind)).toEqual(["consultation", "measure", "install", "service"]);
  });

  it("creates a measure event from its own appointment", async () => {
    store.getCalendarJob.mockResolvedValue(jobWith(appt("measure", CONSULT_AT)));
    graphFetch.mockResolvedValue(Response.json({ id: "e5", changeKey: "ck5" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["POST users/jobs@example.com/events"]);
    expect(graphFetch.mock.calls[0][1].body.subject).toBe("Measure · Dana Reyes");
    expect(graphFetch.mock.calls[0][1].body.isAllDay).toBe(false);
    expect(store.saveLink).toHaveBeenCalledWith({ leadId: ID, kind: "measure", eventId: "e5", changeKey: "ck5", bodyHash: HASH });
  });

  it("does nothing for a job with no confirmed appointment", async () => {
    store.getCalendarJob.mockResolvedValue(jobWith());
    await sync.syncJobCalendar(ID);
    expect(graphFetch).not.toHaveBeenCalled();
    expect(store.claimLink).not.toHaveBeenCalled();
  });

  it("removes the event when the only appointment is no longer confirmed", async () => {
    // An unconfirmed appointment is not returned by the store, so it reads exactly like no date at all.
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue(jobWith());
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toContain("DELETE users/jobs@example.com/events/e1");
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "e1");
  });
});

describe("syncJobCalendar (tracker wins)", () => {
  it("creates an event for a new date and stores the link", async () => {
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["POST users/jobs@example.com/events"]);
    expect(graphFetch.mock.calls[0][1].body.subject).toBe("Consultation · Dana Reyes");
    expect(graphFetch.mock.calls[0][1].body.body.content).toContain(`https://pss.example/admin/jobs/${ID}`);
    expect(store.saveLink).toHaveBeenCalledWith(link);
  });

  it("patches a moved consultation, keeping its length, and stores the new changeKey", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue(jobWith(appt("consultation", new Date("2026-09-21T16:00:00Z"))));
    graphFetch
      .mockResolvedValueOnce(Response.json(event({ end: { dateTime: "2026-09-20T11:30:00.0000000", timeZone: PST } })))
      .mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1", "PATCH users/jobs@example.com/events/e1"]);
    expect(graphFetch.mock.calls[1][1].body.end.dateTime).toBe("2026-09-21T10:30:00");
    expect(graphFetch.mock.calls[1][1].body.isAllDay).toBe(false);
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
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "e1");
  });

  it("re-creates an event Outlook no longer has, dropping only the link it saw", async () => {
    store.getLinks.mockResolvedValue([link]);
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: "e9", changeKey: "ck9" }, { status: 201 }));
    await sync.syncJobCalendar(ID, ["consultation"]);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "e1");
    expect(store.deleteLink).not.toHaveBeenCalledWith(ID, "consultation");
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
    store.getCalendarJob.mockResolvedValue(jobWith(appt("install", new Date("2026-10-02T15:00:00Z"), true)));
    graphFetch.mockResolvedValue(Response.json({ id: "e2", changeKey: "c" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(graphFetch.mock.calls[0][1].body.isAllDay).toBe(true);
    expect(graphFetch.mock.calls[0][1].body.start.dateTime).toBe("2026-10-02T00:00:00");
    expect(store.saveLink).toHaveBeenCalledWith({ leadId: ID, kind: "install", eventId: "e2", changeKey: "c", bodyHash: HASH });
  });

  it("creates a timed install when that is how it was booked", async () => {
    store.getCalendarJob.mockResolvedValue(jobWith(appt("install", CONSULT_AT, false)));
    graphFetch.mockResolvedValue(Response.json({ id: "e2", changeKey: "c" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(graphFetch.mock.calls[0][1].body.isAllDay).toBe(false);
    expect(graphFetch.mock.calls[0][1].body.start.dateTime).toBe("2026-09-20T10:00:00");
  });
});

describe("syncJobCalendar push kinds (only a date the tracker just changed wins)", () => {
  const movedInOutlook = () => event({
    changeKey: "ck2", start: { dateTime: "2026-09-22T14:00:00.0000000", timeZone: PST },
    end: { dateTime: "2026-09-22T15:00:00.0000000", timeZone: PST },
  });
  beforeEach(() => { store.getLinks.mockResolvedValue([link]); });

  it("keeps an unsynced Outlook move when the save did not touch that date", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(movedInOutlook()));
    await sync.syncJobCalendar(ID);
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "consultation", new Date("2026-09-22T21:00:00Z"),
      expect.stringMatching(/^Consultation moved in Outlook/));
    expect(calls().some((c) => c.startsWith("PATCH"))).toBe(false);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2" });
  });

  it("pushes the tracker's date when this save changed it, even if Outlook moved too", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(movedInOutlook()))
      .mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck3" }));
    await sync.syncJobCalendar(ID, ["consultation"]);
    expect(calls()).toContain("PATCH users/jobs@example.com/events/e1");
    expect(graphFetch.mock.calls[1][1].body.start.dateTime).toBe("2026-09-20T10:00:00");
    expect(store.setJobDate).not.toHaveBeenCalled();
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck3" });
  });

  it("clears the date, rather than re-creating, when Outlook deleted an event the save did not touch", async () => {
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "e1");
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "consultation", null, "Consultation removed in Outlook");
    expect(calls().some((c) => c.startsWith("POST"))).toBe(false);
  });

  it("re-creates a deleted event when this save changed its date", async () => {
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: "e9", changeKey: "ck9" }, { status: 201 }));
    await sync.syncJobCalendar(ID, ["consultation"]);
    expect(calls()).toContain("POST users/jobs@example.com/events");
    expect(store.setJobDate).not.toHaveBeenCalled();
  });
});

describe("creating an event claims the link first", () => {
  const MIN = 60_000;
  const pending = (ageMs: number) => ({ ...link, eventId: "pending:abc", changeKey: "", syncedAt: new Date(Date.now() - ageMs) });

  it("claims before posting, then stores the real event id", async () => {
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(store.claimLink).toHaveBeenCalledWith(ID, "consultation");
    expect(store.claimLink.mock.invocationCallOrder[0]).toBeLessThan(graphFetch.mock.invocationCallOrder[0]);
    expect(store.saveLink).toHaveBeenCalledWith(link);
  });

  it("does not post when another sync holds the claim", async () => {
    store.claimLink.mockResolvedValue(null);
    await sync.syncJobCalendar(ID);
    expect(graphFetch).not.toHaveBeenCalled();
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("releases only its own claim when the post fails", async () => {
    graphFetch.mockResolvedValue(new Response("down", { status: 500 }));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledTimes(1);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "pending:new");
    expect(store.saveLink).not.toHaveBeenCalled();
    expect(store.recordError).toHaveBeenCalledWith(expect.stringMatching(/500/));
  });

  it("releases only its own claim when the created event's JSON can't be read", async () => {
    graphFetch.mockResolvedValue(new Response("not json", { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledTimes(1);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "pending:new");
    expect(store.saveLink).not.toHaveBeenCalled();
    expect(store.recordError).toHaveBeenCalled();
  });

  it("deletes the new Outlook event and releases the claim when saving the link fails", async () => {
    graphFetch.mockResolvedValueOnce(Response.json({ id: "e/7", changeKey: "ck7" }, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    store.saveLink.mockRejectedValue(new Error("db down"));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["POST users/jobs@example.com/events", "DELETE users/jobs@example.com/events/e%2F7"]);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "pending:new");
    expect(store.deleteLink.mock.invocationCallOrder[0]).toBeGreaterThan(graphFetch.mock.invocationCallOrder[1]);
    expect(store.recordError).toHaveBeenCalledWith("db down");
  });

  it("reports the post failure, not the release failure, when giving the claim back fails too", async () => {
    graphFetch.mockResolvedValue(new Response("down", { status: 500 }));
    store.deleteLink.mockRejectedValue(new Error("release failed"));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "pending:new");
    expect(store.recordError).toHaveBeenCalledWith(expect.stringMatching(/500/));
    expect(store.recordError).not.toHaveBeenCalledWith("release failed");
  });

  it("reports the save failure, not the release failure, when giving the claim back fails too", async () => {
    graphFetch.mockResolvedValueOnce(Response.json({ id: "e7", changeKey: "ck7" }, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    store.saveLink.mockRejectedValue(new Error("db down"));
    store.deleteLink.mockRejectedValue(new Error("release failed"));
    await sync.syncJobCalendar(ID);
    expect(store.recordError).toHaveBeenCalledWith("db down");
    expect(store.recordError).not.toHaveBeenCalledWith("release failed");
  });

  it("still releases the claim and reports the save failure when that clean-up delete fails", async () => {
    graphFetch.mockResolvedValueOnce(Response.json({ id: "e7", changeKey: "ck7" }, { status: 201 }))
      .mockRejectedValueOnce(new Error("network"));
    store.saveLink.mockRejectedValue(new Error("db down"));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "pending:new");
    expect(store.recordError).toHaveBeenCalledWith("db down");
  });

  it("skips a kind whose event another sync is creating right now", async () => {
    store.getLinks.mockResolvedValue([pending(1 * MIN)]);
    await sync.syncJobCalendar(ID, ["consultation"]);
    expect(graphFetch).not.toHaveBeenCalled();
    expect(store.deleteLink).not.toHaveBeenCalled();
    expect(store.claimLink).not.toHaveBeenCalled();
  });

  it("takes over a claim abandoned for over 10 minutes, deleting it only if it is still that claim", async () => {
    store.getLinks.mockResolvedValue([pending(11 * MIN)]);
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledTimes(1);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "consultation", "pending:abc");
    expect(store.claimLink).toHaveBeenCalledWith(ID, "consultation");
    expect(calls()).toEqual(["POST users/jobs@example.com/events"]);
    expect(store.saveLink).toHaveBeenCalledWith(link);
  });
});

describe("a missing Outlook config", () => {
  it("records 'Outlook is not configured' instead of crashing on a null config", async () => {
    enabled.mockReturnValue(false);
    store.getLinkByEvent.mockResolvedValue(link);
    await sync.applyOutlookChange("e1");
    expect(store.recordError).toHaveBeenCalledWith("Outlook is not configured");
    expect(graphFetch).not.toHaveBeenCalled();
  });
});

describe("Graph paths", () => {
  it("encodes the event id in the path, leaving the mailbox alone", async () => {
    const odd = { ...link, eventId: "AAMk/a+b=" };
    store.getLinks.mockResolvedValue([odd]);
    store.getCalendarJob.mockResolvedValue(jobWith(appt("consultation", new Date("2026-09-21T16:00:00Z"))));
    graphFetch.mockResolvedValueOnce(Response.json(event({ id: odd.eventId })))
      .mockResolvedValueOnce(Response.json({ changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual([
      "GET users/jobs@example.com/events/AAMk%2Fa%2Bb%3D", "PATCH users/jobs@example.com/events/AAMk%2Fa%2Bb%3D",
    ]);
  });
});

describe("a moved install", () => {
  it("patches it as an all-day event", async () => {
    const installLink = { ...link, kind: "install", eventId: "e2" };
    store.getLinks.mockResolvedValue([installLink]);
    store.getCalendarJob.mockResolvedValue(jobWith(appt("install", new Date("2026-10-03T15:00:00Z"), true)));
    graphFetch.mockResolvedValueOnce(Response.json(event({
      id: "e2", isAllDay: true, start: { dateTime: "2026-10-02T00:00:00.0000000", timeZone: PST },
      end: { dateTime: "2026-10-03T00:00:00.0000000", timeZone: PST },
    }))).mockResolvedValueOnce(Response.json({ changeKey: "ck2" }));
    await sync.syncJobCalendar(ID, ["install"]);
    expect(graphFetch.mock.calls[1][1].method).toBe("PATCH");
    expect(graphFetch.mock.calls[1][1].body).toMatchObject({ isAllDay: true, start: { dateTime: "2026-10-03T00:00:00" } });
  });
});

describe("a subject Outlook still shows under older wording", () => {
  beforeEach(() => { store.getLinks.mockResolvedValue([link]); });

  it("patches the subject back to the kind's label, times unchanged", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event({ subject: "Visit · Dana Reyes" })))
      .mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1", "PATCH users/jobs@example.com/events/e1"]);
    // Pinned to the one source the create also uses, so the two can never drift apart.
    expect(graphFetch.mock.calls[1][1].body).toEqual({ subject: eventSubject("consultation", { name: "Dana Reyes" }) });
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2" });
  });

  it("corrects the subject in the same PATCH that moves the time", async () => {
    store.getCalendarJob.mockResolvedValue(jobWith(appt("consultation", new Date("2026-09-21T16:00:00Z"))));
    graphFetch.mockResolvedValueOnce(Response.json(event({ subject: "Visit · Dana Reyes" })))
      .mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls().filter((c) => c.startsWith("PATCH"))).toHaveLength(1);
    expect(graphFetch.mock.calls[1][1].body.subject).toBe("Consultation · Dana Reyes");
    expect(graphFetch.mock.calls[1][1].body.start.dateTime).toBe("2026-09-21T09:00:00");
  });

  it("sends no PATCH when the subject already matches", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event({ subject: "Consultation · Dana Reyes" })));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).not.toHaveBeenCalled();
  });
});

describe("the event body: gate code and designer notes", () => {
  const NOTES = "Side gate sticks\nBring motorized samples";
  const gated = (notes: string | null = NOTES) => ({ ...jobWith(appt("consultation", CONSULT_AT, false, notes)), gateCode: "#4321" });
  const wantedText = (notes: string | null = NOTES) => eventText(gated(notes), notes, JOB_URL);
  const patches = () => graphFetch.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => init.body);

  it("creates the event with the gate code and the appointment's notes, and stores that body's hash", async () => {
    store.getCalendarJob.mockResolvedValue(gated());
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    const sent = graphFetch.mock.calls[0][1].body.body;
    expect(sent).toEqual({ contentType: "text", content: wantedText() });
    expect(sent.content.startsWith("Gate code: #4321\nDesigner notes:\nSide gate sticks\nBring motorized samples\n\nPhone:")).toBe(true);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, bodyHash: bodyHash(wantedText()) });
  });

  it("PATCHes only the body when the notes changed, then stores the new hash and changeKey", async () => {
    store.getLinks.mockResolvedValue([link]); // holds the hash of the body without notes
    store.getCalendarJob.mockResolvedValue(gated());
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1", "PATCH users/jobs@example.com/events/e1"]);
    expect(patches()).toEqual([{ body: { contentType: "text", content: wantedText() } }]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2", bodyHash: bodyHash(wantedText()) });
  });

  it("a failed body PATCH leaves saveLink uncalled and the old hash in place", async () => {
    store.getLinks.mockResolvedValue([link]); // holds the hash of the body without notes
    store.getCalendarJob.mockResolvedValue(gated());
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(new Response("down", { status: 500 }));
    await expect(sync.syncJobCalendar(ID)).resolves.toBeUndefined();
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1", "PATCH users/jobs@example.com/events/e1"]);
    expect(store.recordError).toHaveBeenCalledWith(expect.stringMatching(/500/));
    // No new hash is stored, so the stored one still differs and the body goes again next pass.
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("sends no body when the stored hash matches, whatever Outlook's copy of the body says", async () => {
    store.getLinks.mockResolvedValue([{ ...link, bodyHash: bodyHash(wantedText()) }]);
    store.getCalendarJob.mockResolvedValue(gated());
    // Graph can return the body as HTML; it is never compared, so this changes nothing.
    graphFetch.mockResolvedValueOnce(Response.json(event({ body: { contentType: "html", content: "<html>typed in Outlook</html>" } })));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("writes the body once to an event created before the hash existed", async () => {
    store.getLinks.mockResolvedValue([{ ...link, bodyHash: null }]);
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(patches()).toEqual([{ body: { contentType: "text", content: eventText(job, null, JOB_URL) } }]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2", bodyHash: HASH });

    // The next pass finds the hash it stored and sends nothing.
    graphFetch.mockReset();
    store.saveLink.mockReset();
    store.getLinks.mockResolvedValue([{ ...link, changeKey: "ck2" }]);
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck2" })));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("moves the time and replaces the body in one PATCH", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue({ ...gated(), appointments: [appt("consultation", new Date("2026-09-21T16:00:00Z"), false, NOTES)] });
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID, ["consultation"]);
    expect(patches()).toHaveLength(1);
    expect(patches()[0]).toMatchObject({ start: { dateTime: "2026-09-21T09:00:00" }, body: { contentType: "text", content: wantedText() } });
  });

  it("sends nothing back when Outlook is newer and nothing was pushed, keeping the old hash so the body goes next time", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue(gated());
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck9" })));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck9" }); // bodyHash still the old HASH

    // Next pass: the changeKeys agree, the hash still differs, so the body goes out.
    graphFetch.mockReset();
    store.saveLink.mockReset();
    store.getLinks.mockResolvedValue([{ ...link, changeKey: "ck9" }]);
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck9" }))).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck10" }));
    await sync.syncJobCalendar(ID);
    expect(patches()).toEqual([{ body: { contentType: "text", content: wantedText() } }]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck10", bodyHash: bodyHash(wantedText()) });
  });

  it("gives each kind its own notes", async () => {
    store.getCalendarJob.mockResolvedValue({
      ...jobWith(appt("consultation", CONSULT_AT, false, "Consult note"), appt("measure", CONSULT_AT, false, "Measure note")),
      gateCode: null,
    });
    graphFetch.mockImplementation(async () => Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    const bodies = graphFetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => init.body.body.content as string);
    expect(bodies[0]).toContain("Designer notes:\nConsult note");
    expect(bodies[0]).not.toContain("Measure note");
    expect(bodies[1]).toContain("Designer notes:\nMeasure note");
  });
});

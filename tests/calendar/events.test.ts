import { describe, it, expect } from "vitest";
import { newEventBody, movedTimes, trackerValue, sameValue, type GraphEvent } from "@/lib/calendar/events";

const job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: "12 Elm St", city: "Henderson", treatments: ["Shades"],
};
const URL_ = "https://example.com/admin?job=" + job.id;
const PST = "Pacific Standard Time";
const ev = (start: string, end: string, isAllDay = false): GraphEvent => ({
  id: "e1", changeKey: "ck", isAllDay, start: { dateTime: start, timeZone: PST }, end: { dateTime: end, timeZone: PST },
});

describe("newEventBody", () => {
  it("builds a 1-hour visit in Las Vegas time with contact details", () => {
    // 17:00Z in September is 10:00 in Las Vegas (UTC-7).
    const body = newEventBody("visit", job, new Date("2026-09-20T17:00:00Z"), URL_);
    expect(body.subject).toBe("Visit · Dana Reyes");
    expect(body.isAllDay).toBe(false);
    expect(body.start).toEqual({ dateTime: "2026-09-20T10:00:00", timeZone: PST });
    expect(body.end).toEqual({ dateTime: "2026-09-20T11:00:00", timeZone: PST });
    expect(body.location).toEqual({ displayName: "12 Elm St, Henderson" });
    expect(body.body.contentType).toBe("text");
    expect(body.body.content).toContain("(702) 555-0134");
    expect(body.body.content).toContain("dana@example.com");
    expect(body.body.content).toContain("Shades");
    expect(body.body.content).toContain(URL_);
  });

  it("builds an all-day install ending the next midnight", () => {
    const body = newEventBody("install", job, "2026-12-31", URL_);
    expect(body.subject).toBe("Install · Dana Reyes");
    expect(body.isAllDay).toBe(true);
    expect(body.start).toEqual({ dateTime: "2026-12-31T00:00:00", timeZone: PST });
    expect(body.end).toEqual({ dateTime: "2027-01-01T00:00:00", timeZone: PST });
  });

  it("uses the city alone when there is no address", () => {
    const body = newEventBody("visit", { ...job, address: null }, new Date("2026-09-20T17:00:00Z"), URL_);
    expect(body.location).toEqual({ displayName: "Henderson" });
  });
});

describe("movedTimes", () => {
  it("keeps the visit's current length in Outlook", () => {
    const current = ev("2026-09-20T10:00:00.0000000", "2026-09-20T11:30:00.0000000");
    expect(movedTimes("visit", new Date("2026-09-21T16:00:00Z"), current)).toEqual({
      isAllDay: false,
      start: { dateTime: "2026-09-21T09:00:00", timeZone: PST },
      end: { dateTime: "2026-09-21T10:30:00", timeZone: PST },
    });
  });

  it("moves an install as a whole day", () => {
    const current = ev("2026-09-20T00:00:00.0000000", "2026-09-21T00:00:00.0000000", true);
    expect(movedTimes("install", "2026-10-02", current)).toEqual({
      isAllDay: true,
      start: { dateTime: "2026-10-02T00:00:00", timeZone: PST },
      end: { dateTime: "2026-10-03T00:00:00", timeZone: PST },
    });
  });
});

describe("trackerValue", () => {
  it("reads a visit start as an instant, across daylight saving", () => {
    expect(trackerValue("visit", ev("2026-09-20T10:00:00.0000000", "2026-09-20T11:00:00.0000000")))
      .toEqual(new Date("2026-09-20T17:00:00Z"));
    // 1 Nov 2026 is after the fall-back switch: 10:00 is UTC-8.
    expect(trackerValue("visit", ev("2026-11-02T10:00:00.0000000", "2026-11-02T11:00:00.0000000")))
      .toEqual(new Date("2026-11-02T18:00:00Z"));
  });

  it("reads an install's start date, even from a timed event", () => {
    expect(trackerValue("install", ev("2026-10-02T00:00:00.0000000", "2026-10-03T00:00:00.0000000", true))).toBe("2026-10-02");
    expect(trackerValue("install", ev("2026-10-02T08:00:00.0000000", "2026-10-02T12:00:00.0000000"))).toBe("2026-10-02");
  });
});

describe("sameValue", () => {
  it("compares visits to the minute and installs by date", () => {
    expect(sameValue("visit", new Date("2026-09-20T17:00:00Z"), new Date("2026-09-20T17:00:30Z"))).toBe(true);
    expect(sameValue("visit", new Date("2026-09-20T17:00:00Z"), new Date("2026-09-20T18:00:00Z"))).toBe(false);
    expect(sameValue("install", "2026-10-02", "2026-10-02")).toBe(true);
    expect(sameValue("install", null, "2026-10-02")).toBe(false);
    expect(sameValue("visit", null, null)).toBe(true);
  });
});

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
  it("builds a 1-hour consultation in Las Vegas time with contact details", () => {
    // 17:00Z in September is 10:00 in Las Vegas (UTC-7).
    const body = newEventBody("consultation", job, new Date("2026-09-20T17:00:00Z"), URL_, false);
    expect(body.subject).toBe("Consultation · Dana Reyes");
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

  it("titles a measure and a service with their own labels, each one timed hour", () => {
    const measure = newEventBody("measure", job, new Date("2026-09-20T17:00:00Z"), URL_, false);
    expect(measure.subject).toBe("Measure · Dana Reyes");
    expect(measure.isAllDay).toBe(false);
    expect(measure.start).toEqual({ dateTime: "2026-09-20T10:00:00", timeZone: PST });
    expect(measure.end).toEqual({ dateTime: "2026-09-20T11:00:00", timeZone: PST });

    const service = newEventBody("service", job, new Date("2026-09-20T17:00:00Z"), URL_, false);
    expect(service.subject).toBe("Service · Dana Reyes");
    expect(service.isAllDay).toBe(false);
    expect(service.end).toEqual({ dateTime: "2026-09-20T11:00:00", timeZone: PST });
  });

  it("builds an all-day install ending the next midnight", () => {
    const body = newEventBody("install", job, "2026-12-31", URL_, true);
    expect(body.subject).toBe("Install · Dana Reyes");
    expect(body.isAllDay).toBe(true);
    expect(body.start).toEqual({ dateTime: "2026-12-31T00:00:00", timeZone: PST });
    expect(body.end).toEqual({ dateTime: "2027-01-01T00:00:00", timeZone: PST });
  });

  it("builds a timed install as one hour, because allDay decides the shape, not the kind", () => {
    const body = newEventBody("install", job, new Date("2026-09-20T17:00:00Z"), URL_, false);
    expect(body.subject).toBe("Install · Dana Reyes");
    expect(body.isAllDay).toBe(false);
    expect(body.start).toEqual({ dateTime: "2026-09-20T10:00:00", timeZone: PST });
    expect(body.end).toEqual({ dateTime: "2026-09-20T11:00:00", timeZone: PST });
  });

  it("builds an all-day consultation when that is how it was booked", () => {
    const body = newEventBody("consultation", job, "2026-12-31", URL_, true);
    expect(body.isAllDay).toBe(true);
    expect(body.start).toEqual({ dateTime: "2026-12-31T00:00:00", timeZone: PST });
    expect(body.end).toEqual({ dateTime: "2027-01-01T00:00:00", timeZone: PST });
  });

  it("uses the city alone when there is no address", () => {
    const body = newEventBody("consultation", { ...job, address: null }, new Date("2026-09-20T17:00:00Z"), URL_, false);
    expect(body.location).toEqual({ displayName: "Henderson" });
  });
});

describe("movedTimes", () => {
  it("keeps a timed appointment's current length in Outlook", () => {
    const current = ev("2026-09-20T10:00:00.0000000", "2026-09-20T11:30:00.0000000");
    expect(movedTimes(false, new Date("2026-09-21T16:00:00Z"), current)).toEqual({
      isAllDay: false,
      start: { dateTime: "2026-09-21T09:00:00", timeZone: PST },
      end: { dateTime: "2026-09-21T10:30:00", timeZone: PST },
    });
  });

  it("falls back to an hour when the event in Outlook was turned all-day", () => {
    const current = ev("2026-09-20T00:00:00.0000000", "2026-09-21T00:00:00.0000000", true);
    expect(movedTimes(false, new Date("2026-09-21T16:00:00Z"), current)).toEqual({
      isAllDay: false,
      start: { dateTime: "2026-09-21T09:00:00", timeZone: PST },
      end: { dateTime: "2026-09-21T10:00:00", timeZone: PST },
    });
  });

  it("moves an all-day appointment as a whole day", () => {
    const current = ev("2026-09-20T00:00:00.0000000", "2026-09-21T00:00:00.0000000", true);
    expect(movedTimes(true, "2026-10-02", current)).toEqual({
      isAllDay: true,
      start: { dateTime: "2026-10-02T00:00:00", timeZone: PST },
      end: { dateTime: "2026-10-03T00:00:00", timeZone: PST },
    });
  });
});

describe("trackerValue", () => {
  it("reads a timed start as an instant, across daylight saving", () => {
    expect(trackerValue(false, ev("2026-09-20T10:00:00.0000000", "2026-09-20T11:00:00.0000000")))
      .toEqual(new Date("2026-09-20T17:00:00Z"));
    // 1 Nov 2026 is after the fall-back switch: 10:00 is UTC-8.
    expect(trackerValue(false, ev("2026-11-02T10:00:00.0000000", "2026-11-02T11:00:00.0000000")))
      .toEqual(new Date("2026-11-02T18:00:00Z"));
  });

  it("reads an all-day start as a date, even from a timed event", () => {
    expect(trackerValue(true, ev("2026-10-02T00:00:00.0000000", "2026-10-03T00:00:00.0000000", true))).toBe("2026-10-02");
    expect(trackerValue(true, ev("2026-10-02T08:00:00.0000000", "2026-10-02T12:00:00.0000000"))).toBe("2026-10-02");
  });
});

describe("sameValue", () => {
  it("compares timed appointments to the minute and all-day ones by date", () => {
    expect(sameValue(false, new Date("2026-09-20T17:00:00Z"), new Date("2026-09-20T17:00:30Z"))).toBe(true);
    expect(sameValue(false, new Date("2026-09-20T17:00:00Z"), new Date("2026-09-20T18:00:00Z"))).toBe(false);
    expect(sameValue(true, "2026-10-02", "2026-10-02")).toBe(true);
    expect(sameValue(true, null, "2026-10-02")).toBe(false);
    expect(sameValue(false, null, null)).toBe(true);
  });
});

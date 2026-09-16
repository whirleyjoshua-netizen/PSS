import { describe, it, expect } from "vitest";
import { durationSeconds, parseOptimizeResponse, reasonText } from "@/lib/routes/optimize-response";
import type { DayStop, RouteSettings } from "@/lib/routes/types";

const SETTINGS: RouteSettings = { dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } };
const base = { appointmentId: "", jobId: "j", name: "n", address: "a", city: "c", kind: "install", startsAt: "", allDay: true,
  confirmed: true, windowStart: null, windowEnd: null, durationMinutes: 60, lat: 1, lng: 1, assignedTo: null, updatedAt: "" } as DayStop;
const stops: DayStop[] = [
  { ...base, appointmentId: "s1", windowStart: "08:00", windowEnd: "10:00" },
  { ...base, appointmentId: "s2" },
  { ...base, appointmentId: "s3" },
];
const ctx = { day: "2026-09-24", builtAt: "2026-09-23T20:00:00.000Z", shipments: ["s1", "s2", "s3"], vehicles: ["ana", "bo"], stops, settings: SETTINGS };

describe("parseOptimizeResponse", () => {
  it("returns each installer's stops in visit order with arrivals and drive minutes", () => {
    const plan = parseOptimizeResponse({
      routes: [
        {
          vehicleIndex: 0,
          visits: [{ shipmentIndex: 1, startTime: "2026-09-24T16:00:00Z" }, { shipmentIndex: 0, startTime: "2026-09-24T17:25:00Z" }],
          transitions: [{ travelDuration: "900s" }, { travelDuration: "1500s" }, {}],
          routePolyline: { points: "abc" },
          metrics: { travelDuration: "1500s" },
        },
        { vehicleIndex: 1 },
      ],
    }, ctx);
    expect(plan.day).toBe("2026-09-24");
    expect(plan.builtAt).toBe(ctx.builtAt);
    expect(plan.routes).toEqual([
      { teamMemberId: "ana", polyline: "abc", driveMinutes: 25, stops: [
        { appointmentId: "s2", arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 0, outsideWindow: false },
        { appointmentId: "s1", arrival: "2026-09-24T17:25:00.000Z", driveMinutes: 25, outsideWindow: true },
      ] },
      { teamMemberId: "bo", polyline: null, driveMinutes: 0, stops: [] },
    ]);
  });

  it("never counts a drive before the first stop, even when Google reports one", () => {
    const plan = parseOptimizeResponse({
      routes: [{ visits: [{ shipmentIndex: 1, startTime: "2026-09-24T16:00:00Z" }], transitions: [{ travelDuration: "900s" }, {}] }],
    }, ctx);
    expect(plan.routes[0].stops[0].driveMinutes).toBe(0);
    expect(plan.routes[0].driveMinutes).toBe(0);
  });

  it("flags outsideWindow only for promised windows, not for a stop outside the working day", () => {
    const plan = parseOptimizeResponse({
      routes: [{ visits: [{ shipmentIndex: 1, startTime: "2026-09-24T05:00:00Z" }] }],
    }, ctx);
    expect(plan.routes[0].stops[0]).toMatchObject({ appointmentId: "s2", outsideWindow: false });
  });

  it("ignores a route for a vehicle index it did not send", () => {
    const plan = parseOptimizeResponse({
      routes: [{ vehicleIndex: 5, visits: [{ shipmentIndex: 1, startTime: "2026-09-24T16:00:00Z" }] }],
    }, ctx);
    expect(plan.routes.map((r) => r.stops.length)).toEqual([0, 0]);
  });

  it("gives every vehicle a route even when Google omits an empty one, and treats a missing index as 0", () => {
    const plan = parseOptimizeResponse({ routes: [{ visits: [{ startTime: "2026-09-24T16:00:00Z" }] }] }, ctx);
    expect(plan.routes.map((r) => r.teamMemberId)).toEqual(["ana", "bo"]);
    expect(plan.routes[0].stops[0].appointmentId).toBe("s1");
  });

  it("lists skipped appointments with the reason in plain English", () => {
    const plan = parseOptimizeResponse({
      skippedShipments: [
        { index: 2, reasons: [{ code: "CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS" }] },
        { reasons: [] },
      ],
    }, ctx);
    expect(plan.skipped).toEqual([
      { appointmentId: "s3", reason: "It can't be reached within anyone's working day." },
      { appointmentId: "s1", reason: "It didn't fit around the other stops and their windows." },
    ]);
  });

  it("maps every documented reason code", () => {
    expect(reasonText("NO_VEHICLE")).toBe("No installer was selected for this day.");
    expect(reasonText("VEHICLE_NOT_ALLOWED")).toBe("It is assigned to an installer who can't fit it in.");
    expect(reasonText("SOMETHING_NEW")).toBe("It didn't fit around the other stops and their windows.");
  });

  it("reads protobuf durations", () => {
    expect(durationSeconds("5400s")).toBe(5400);
    expect(durationSeconds("12.5s")).toBe(12.5);
    expect(durationSeconds(undefined)).toBe(0);
  });
});

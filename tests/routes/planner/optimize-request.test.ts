import { describe, it, expect } from "vitest";
import { buildOptimizeRequest, buildRecheckRequest, windowFor } from "@/lib/routes/optimize-request";
import type { DayStop, RouteSettings } from "@/lib/routes/types";

// The request body is untyped JSON; tests walk it freely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modelOf = (body: Record<string, unknown>): any => body.model;

const DAY = "2026-09-24"; // a Thursday in PDT (UTC-7)
const SETTINGS: RouteSettings = { dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } };
const ANA = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Ana" };
const BO = { id: "bbbbbbbb-0000-4000-8000-000000000002", name: "Bo" };
const stop = (over: Partial<DayStop>): DayStop => ({
  appointmentId: "11111111-0000-4000-8000-000000000001", jobId: "j1", name: "Dana", address: "12 Sample St", city: "Henderson",
  kind: "install", startsAt: "2026-09-24T16:00:00.000Z", allDay: true, confirmed: true,
  windowStart: null, windowEnd: null, durationMinutes: 240, lat: 36.03, lng: -115.04, assignedTo: null,
  updatedAt: "2026-09-20T00:00:00.000Z", ...over,
});

describe("buildOptimizeRequest", () => {
  it("makes one delivery per appointment at the job's coordinates, with its length", () => {
    const { body, shipments } = buildOptimizeRequest({ day: DAY, stops: [stop({})], installers: [ANA, BO], settings: SETTINGS });
    const model = modelOf(body);
    expect(shipments).toEqual(["11111111-0000-4000-8000-000000000001"]);
    expect(model.shipments[0]).toMatchObject({
      label: "11111111-0000-4000-8000-000000000001",
      deliveries: [{ arrivalLocation: { latitude: 36.03, longitude: -115.04 }, duration: "14400s" }],
    });
  });

  it("uses the promised window, or the working day when there is none", () => {
    expect(windowFor(stop({ windowStart: "08:00", windowEnd: "10:00" }), DAY, SETTINGS))
      .toEqual({ start: "2026-09-24T15:00:00.000Z", end: "2026-09-24T17:00:00.000Z" });
    expect(windowFor(stop({}), DAY, SETTINGS))
      .toEqual({ start: "2026-09-24T16:00:00.000Z", end: "2026-09-25T01:00:00.000Z" });
    const { body } = buildOptimizeRequest({ day: DAY, stops: [stop({ windowStart: "08:00", windowEnd: "10:00" })], installers: [ANA], settings: SETTINGS });
    expect(modelOf(body).shipments[0].deliveries[0].timeWindows)
      .toEqual([{ startTime: "2026-09-24T15:00:00.000Z", endTime: "2026-09-24T17:00:00.000Z" }]);
  });

  it("keeps a job with its assigned installer only when that installer is selected", () => {
    const locked = buildOptimizeRequest({ day: DAY, stops: [stop({ assignedTo: BO.id })], installers: [ANA, BO], settings: SETTINGS });
    expect(modelOf(locked.body).shipments[0].allowedVehicleIndices).toEqual([1]);
    const free = buildOptimizeRequest({ day: DAY, stops: [stop({ assignedTo: BO.id })], installers: [ANA], settings: SETTINGS });
    expect(modelOf(free.body).shipments[0].allowedVehicleIndices).toBeUndefined();
    const designer = buildOptimizeRequest({ day: DAY, stops: [stop({ assignedTo: "someone-else" })], installers: [ANA], settings: SETTINGS });
    expect(modelOf(designer.body).shipments[0].allowedVehicleIndices).toBeUndefined();
  });

  it("adds one vehicle per selected installer, with no start or end location, the working day, and a travel cost", () => {
    const { body, vehicles } = buildOptimizeRequest({ day: DAY, stops: [stop({})], installers: [ANA, BO], settings: SETTINGS });
    const model = modelOf(body);
    expect(vehicles).toEqual([ANA.id, BO.id]);
    expect(model.vehicles).toHaveLength(2);
    for (const vehicle of model.vehicles) {
      expect(vehicle.startLocation).toBeUndefined();
      expect(vehicle.endLocation).toBeUndefined();
      expect(vehicle.startTimeWindows).toEqual([{ startTime: "2026-09-24T16:00:00.000Z", endTime: "2026-09-25T01:00:00.000Z" }]);
      expect(vehicle.endTimeWindows).toEqual([{ startTime: "2026-09-24T16:00:00.000Z", endTime: "2026-09-25T01:00:00.000Z" }]);
      expect(vehicle.costPerTraveledHour).toBe(60);
      expect(vehicle.costPerHour).toBeUndefined();
      expect(vehicle.travelMode).toBe("DRIVING");
    }
    expect(model.globalStartTime).toBe("2026-09-24T16:00:00.000Z");
    expect(model.globalEndTime).toBe("2026-09-25T01:00:00.000Z");
  });

  it("widens the global range to cover a window outside the working day", () => {
    const { body } = buildOptimizeRequest({ day: DAY, stops: [stop({ windowStart: "07:00", windowEnd: "08:00" })], installers: [ANA], settings: SETTINGS });
    expect(modelOf(body).globalStartTime).toBe("2026-09-24T14:00:00.000Z");
  });

  it("solves normally, without traffic, with polylines and a 15 s timeout, skipping stops with no coordinates", () => {
    const { body, shipments } = buildOptimizeRequest({
      day: DAY, stops: [stop({}), stop({ appointmentId: "no-coords", lat: null, lng: null })], installers: [ANA], settings: SETTINGS,
    });
    expect(shipments).toEqual(["11111111-0000-4000-8000-000000000001"]);
    expect(body).toMatchObject({ solvingMode: "DEFAULT_SOLVE", considerRoadTraffic: false, populatePolylines: true, timeout: "15s" });
  });

  it("uses Las Vegas winter time after the clocks change", () => {
    expect(windowFor(stop({}), "2026-12-03", SETTINGS).start).toBe("2026-12-03T17:00:00.000Z");
  });
});

describe("buildRecheckRequest", () => {
  const stops = [
    stop({ appointmentId: "s1", windowStart: "08:00", windowEnd: "10:00" }),
    stop({ appointmentId: "s2" }),
    stop({ appointmentId: "s3" }),
  ];

  it("fixes each installer's order and assignment and lets Google recompute only the times", () => {
    const { body, shipments, vehicles } = buildRecheckRequest(
      { day: DAY, stops, installers: [ANA, BO], settings: SETTINGS },
      [{ teamMemberId: ANA.id, appointmentIds: ["s2", "s1"] }, { teamMemberId: BO.id, appointmentIds: ["s3"] }],
    );
    expect(shipments).toEqual(["s1", "s2", "s3"]);
    expect(vehicles).toEqual([ANA.id, BO.id]);
    expect(body.solvingMode).toBe("DEFAULT_SOLVE");
    expect(body.injectedFirstSolutionRoutes).toBeUndefined();
    expect(body.injectedSolutionConstraint).toEqual({
      routes: [
        { vehicleIndex: 0, visits: [{ shipmentIndex: 1, isPickup: false }, { shipmentIndex: 0, isPickup: false }] },
        { vehicleIndex: 1, visits: [{ shipmentIndex: 2, isPickup: false }] },
      ],
      constraintRelaxations: [{
        relaxations: [{ level: "RELAX_VISIT_TIMES_AFTER_THRESHOLD", thresholdVisitCount: 0 }],
        vehicleIndices: [0, 1],
      }],
    });
    expect(body.considerRoadTraffic).toBe(false);
  });

  it("sends windows as soft, so a broken window comes back as a time instead of a skipped stop", () => {
    const { body } = buildRecheckRequest(
      { day: DAY, stops, installers: [ANA, BO], settings: SETTINGS },
      [{ teamMemberId: ANA.id, appointmentIds: ["s1", "s2"] }, { teamMemberId: BO.id, appointmentIds: ["s3"] }],
    );
    const tw = modelOf(body).shipments[0].deliveries[0].timeWindows[0];
    expect(tw.startTime).toBeUndefined();
    expect(tw).toMatchObject({
      softStartTime: "2026-09-24T15:00:00.000Z", softEndTime: "2026-09-24T17:00:00.000Z",
      costPerHourBeforeSoftStartTime: 1000, costPerHourAfterSoftEndTime: 1000,
    });
  });

  it("leaves out stops that are not on any route (they stay under Didn't fit)", () => {
    const { shipments } = buildRecheckRequest(
      { day: DAY, stops, installers: [ANA, BO], settings: SETTINGS },
      [{ teamMemberId: ANA.id, appointmentIds: ["s1"] }, { teamMemberId: BO.id, appointmentIds: [] }],
    );
    expect(shipments).toEqual(["s1"]);
  });
});

import { describe, it, expect } from "vitest";
import { moveStop, shiftStop } from "@/lib/routes/edit";
import type { RoutePlan } from "@/lib/routes/types";

const ANA = "11111111-1111-4111-8111-111111111111";
const BO = "22222222-2222-4222-8222-222222222222";
const CY = "33333333-3333-4333-8333-333333333333";
const stop = (appointmentId: string) => ({ appointmentId, arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 10, outsideWindow: false });

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const fixture = (): RoutePlan => deepFreeze({
  day: "2026-09-24", builtAt: "2026-09-23T10:00:00.000Z", skipped: [],
  routes: [
    { teamMemberId: ANA, polyline: "abc", driveMinutes: 20, stops: [stop("a1"), stop("a2"), stop("a3")] },
    { teamMemberId: BO, polyline: "def", driveMinutes: 10, stops: [stop("b1")] },
  ],
});

const ids = (plan: RoutePlan, member: string) =>
  plan.routes.find((r) => r.teamMemberId === member)?.stops.map((s) => s.appointmentId);

describe("moveStop", () => {
  it("takes the stop off Ana's route and appends it to Bo's, clearing both polylines", () => {
    const next = moveStop(fixture(), "a2", BO);
    expect(ids(next, ANA)).toEqual(["a1", "a3"]);
    expect(ids(next, BO)).toEqual(["b1", "a2"]);
    expect(next.routes.map((r) => r.polyline)).toEqual([null, null]);
  });

  it("is a no-op when moving to the same installer", () => {
    const plan = fixture();
    expect(moveStop(plan, "a2", ANA)).toBe(plan);
  });

  it("creates the target route when that installer has none", () => {
    const next = moveStop(fixture(), "a1", CY);
    expect(ids(next, ANA)).toEqual(["a2", "a3"]);
    expect(ids(next, CY)).toEqual(["a1"]);
    expect(next.routes.find((r) => r.teamMemberId === CY)).toMatchObject({ polyline: null, driveMinutes: 0 });
  });

  it("does not mutate the input", () => {
    expect(() => moveStop(fixture(), "a2", BO)).not.toThrow();
    expect(() => moveStop(fixture(), "a2", CY)).not.toThrow();
  });
});

describe("shiftStop", () => {
  it("swaps neighbours and clears that route's polyline only", () => {
    const next = shiftStop(fixture(), "a2", -1);
    expect(ids(next, ANA)).toEqual(["a2", "a1", "a3"]);
    expect(next.routes[0].polyline).toBeNull();
    expect(next.routes[1].polyline).toBe("def");
    expect(ids(shiftStop(fixture(), "a2", 1), ANA)).toEqual(["a1", "a3", "a2"]);
  });

  it("leaves the first stop moving up and the last moving down alone", () => {
    const plan = fixture();
    expect(ids(shiftStop(plan, "a1", -1), ANA)).toEqual(["a1", "a2", "a3"]);
    expect(ids(shiftStop(plan, "a3", 1), ANA)).toEqual(["a1", "a2", "a3"]);
    expect(shiftStop(plan, "a3", 1).routes[0].polyline).toBe("abc");
  });

  it("does not mutate the input", () => {
    expect(() => shiftStop(fixture(), "a2", 1)).not.toThrow();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const day = {
  loadDay: vi.fn(), listInstallers: vi.fn(), listGeocodeErrors: vi.fn(), saveRoutePlan: vi.fn(),
  isRouteDay: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v),
};
vi.mock("@/lib/routes/day", () => day);
const geocode = { geocodeLead: vi.fn() };
vi.mock("@/lib/routes/geocode", () => geocode);
vi.mock("@/lib/routes/settings", () => ({ getRouteSettings: vi.fn(async () => ({ dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } })) }));
class RoutePlanningUnavailable extends Error {}
const optimize = { optimizeTours: vi.fn(), routePlanningConfigured: vi.fn(() => true), RoutePlanningUnavailable };
vi.mock("@/lib/routes/optimize", () => optimize);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const actions = await import("@/app/admin/schedule/route-actions");
const D = "2026-09-24";
const ANA = "aaaaaaaa-0000-4000-8000-000000000001";
const BO = "bbbbbbbb-0000-4000-8000-000000000002";
const S1 = "11111111-0000-4000-8000-000000000001";
const S2 = "22222222-0000-4000-8000-000000000002";
const STOP = { appointmentId: S1, jobId: "j", name: "Dana", address: "12 Sample St", city: "Henderson", kind: "install",
  startsAt: "2026-09-24T16:00:00.000Z", allDay: true, confirmed: true, windowStart: null, windowEnd: null,
  durationMinutes: 240, lat: 36, lng: -115, assignedTo: null, updatedAt: "2026-09-20T00:00:00.000Z" };
const PLAN_STOP = { appointmentId: S1, arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 0, outsideWindow: false };
const PLAN = { day: D, builtAt: "2026-09-23T20:00:00.000Z", skipped: [],
  routes: [{ teamMemberId: ANA, polyline: null, driveMinutes: 0, stops: [PLAN_STOP] }] };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "owner@example.com" });
  day.loadDay.mockResolvedValue([STOP]);
  day.listInstallers.mockResolvedValue([{ id: ANA, name: "Ana" }]);
  day.listGeocodeErrors.mockResolvedValue([]);
  day.saveRoutePlan.mockResolvedValue("ok");
  geocode.geocodeLead.mockResolvedValue(undefined);
  optimize.routePlanningConfigured.mockReturnValue(true);
  optimize.optimizeTours.mockResolvedValue({ routes: [{ visits: [{ startTime: "2026-09-24T16:00:00Z" }], transitions: [{}] }] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("without a session", () => {
  beforeEach(() => { requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT")); });
  it.each([
    ["buildRoutes", () => actions.buildRoutes(D, [ANA])],
    ["recheckRoutes", () => actions.recheckRoutes(D, PLAN, [ANA])],
    ["saveRoutes", () => actions.saveRoutes(D, PLAN)],
  ])("%s touches nothing", async (_n, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    for (const fn of [day.loadDay, day.listInstallers, day.listGeocodeErrors, day.saveRoutePlan, geocode.geocodeLead, optimize.optimizeTours]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("buildRoutes", () => {
  it("returns a preview plan and writes nothing", async () => {
    const result = await actions.buildRoutes(D, [ANA]);
    expect(result).toMatchObject({ ok: true, plan: { day: D, routes: [{ teamMemberId: ANA, stops: [{ appointmentId: S1 }] }] } });
    expect(day.saveRoutePlan).not.toHaveBeenCalled();
  });

  it("only routes selected installers that really are installers", async () => {
    await actions.buildRoutes(D, [ANA, "not-a-member"]);
    expect((optimize.optimizeTours.mock.calls[0][0] as Body).model.vehicles).toHaveLength(1);
  });

  it("retries errored geocodes concurrently, then loads the day", async () => {
    day.listGeocodeErrors.mockResolvedValue(["L1", "L2"]);
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    geocode.geocodeLead.mockImplementation(async (id: string) => { started.push(id); await gate; });
    const pending = actions.buildRoutes(D, [ANA]);
    await vi.waitFor(() => expect(started).toEqual(["L1", "L2"]));
    expect(day.loadDay).not.toHaveBeenCalled();
    release();
    expect((await pending).ok).toBe(true);
    expect(day.listGeocodeErrors).toHaveBeenCalledWith(D);
    expect(day.loadDay).toHaveBeenCalledWith(D);
  });

  it("does not geocode when nothing errored", async () => {
    await actions.buildRoutes(D, [ANA]);
    expect(geocode.geocodeLead).not.toHaveBeenCalled();
  });

  it("says why it can't build", async () => {
    expect(await actions.buildRoutes("nope", [ANA])).toEqual({ ok: false, error: "Pick a day." });
    expect(await actions.buildRoutes(D, [])).toEqual({ ok: false, error: "Pick at least one installer." });
    day.loadDay.mockResolvedValueOnce([]);
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "Nothing is scheduled that day." });
    day.loadDay.mockResolvedValueOnce([{ ...STOP, lat: null, lng: null }]);
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "No appointment that day has a mappable address." });
  });

  it("reports Google failures and missing config the same way", async () => {
    optimize.optimizeTours.mockRejectedValueOnce(new RoutePlanningUnavailable("boom"));
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "Route planning is unavailable right now" });
    optimize.routePlanningConfigured.mockReturnValueOnce(false);
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "Route planning is unavailable right now" });
  });

  it("never leaks a raw error", async () => {
    optimize.optimizeTours.mockRejectedValueOnce(new Error("secret detail"));
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "Route planning is unavailable right now" });
  });
});

describe("recheckRoutes", () => {
  it("sends the owner's order as a constraint and returns the new times", async () => {
    const result = await actions.recheckRoutes(D, PLAN, [ANA]);
    const body = optimize.optimizeTours.mock.calls[0][0] as Body;
    expect(body.injectedSolutionConstraint.routes).toEqual([{ vehicleIndex: 0, visits: [{ shipmentIndex: 0, isPickup: false }] }]);
    expect(result.ok).toBe(true);
  });

  it("keeps an unchecked installer's route, but drops a route for someone who is not an installer", async () => {
    day.loadDay.mockResolvedValue([STOP, { ...STOP, appointmentId: S2 }]);
    day.listInstallers.mockResolvedValue([{ id: ANA, name: "Ana" }, { id: BO, name: "Bo" }]);
    const ghost = "cccccccc-0000-4000-8000-000000000003";
    const plan = { ...PLAN, routes: [
      PLAN.routes[0],
      { teamMemberId: BO, polyline: null, driveMinutes: 0, stops: [{ ...PLAN_STOP, appointmentId: S2 }] },
      { teamMemberId: ghost, polyline: null, driveMinutes: 0, stops: [] },
    ] };
    await actions.recheckRoutes(D, plan, [ANA]);
    const body = optimize.optimizeTours.mock.calls[0][0] as Body;
    expect(body.model.vehicles).toHaveLength(2);
    expect(body.injectedSolutionConstraint.routes).toEqual([
      { vehicleIndex: 0, visits: [{ shipmentIndex: 0, isPickup: false }] },
      { vehicleIndex: 1, visits: [{ shipmentIndex: 1, isPickup: false }] },
    ]);
  });

  it("keeps the plan's skipped list", async () => {
    const result = await actions.recheckRoutes(D, { ...PLAN, skipped: [{ appointmentId: "x", reason: "r" }] }, [ANA]);
    expect(result.ok && result.plan.skipped).toEqual([{ appointmentId: "x", reason: "r" }]);
  });

  it("adds what Google skipped on the re-check, listed once each", async () => {
    optimize.optimizeTours.mockResolvedValue({ routes: [], skippedShipments: [{ index: 0 }] });
    const result = await actions.recheckRoutes(D, { ...PLAN, skipped: [{ appointmentId: "x", reason: "r" }] }, [ANA]);
    expect(result.ok && result.plan.skipped.map((s) => s.appointmentId)).toEqual(["x", S1]);
    optimize.optimizeTours.mockResolvedValue({ routes: [], skippedShipments: [{ index: 0 }, { index: 0 }] });
    const again = await actions.recheckRoutes(D, PLAN, [ANA]);
    expect(again.ok && again.plan.skipped.map((s) => s.appointmentId)).toEqual([S1]);
  });

  it("rejects a malformed plan", async () => {
    expect(await actions.recheckRoutes(D, { day: D } as never, [ANA])).toEqual({ ok: false, error: "That route could not be read. Build again." });
  });
});

describe("routePlanSchema", () => {
  const UNREADABLE = { ok: false, error: "That route could not be read. Build again." };

  it("rejects two routes for the same installer", async () => {
    const plan = { ...PLAN, routes: [PLAN.routes[0], { ...PLAN.routes[0], stops: [] }] };
    expect(await actions.saveRoutes(D, plan)).toEqual(UNREADABLE);
    expect(await actions.recheckRoutes(D, plan, [ANA])).toEqual(UNREADABLE);
    expect(day.saveRoutePlan).not.toHaveBeenCalled();
    expect(optimize.optimizeTours).not.toHaveBeenCalled();
  });

  it("rejects an appointment listed twice", async () => {
    const twice = { ...PLAN, routes: [{ ...PLAN.routes[0], stops: [PLAN_STOP, PLAN_STOP] }] };
    expect(await actions.saveRoutes(D, twice)).toEqual(UNREADABLE);
    const alsoSkipped = { ...PLAN, skipped: [{ appointmentId: S1, reason: "r" }] };
    expect(await actions.saveRoutes(D, alsoSkipped)).toEqual(UNREADABLE);
    expect(day.saveRoutePlan).not.toHaveBeenCalled();
  });
});

describe("saveRoutes", () => {
  it("saves as the signed-in owner and refreshes the schedule and jobs", async () => {
    expect(await actions.saveRoutes(D, PLAN)).toEqual({ ok: true });
    expect(day.saveRoutePlan).toHaveBeenCalledWith(PLAN, "owner@example.com");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/jobs/[id]", "page");
  });

  it("passes the full skipped list to the save", async () => {
    const plan = { ...PLAN, skipped: [{ appointmentId: S2, reason: "r" }, { appointmentId: "x", reason: "q" }] };
    await actions.saveRoutes(D, plan);
    expect(day.saveRoutePlan).toHaveBeenCalledWith(plan, "owner@example.com");
  });

  it("refuses when the day changed after the build", async () => {
    day.saveRoutePlan.mockResolvedValueOnce("changed");
    expect(await actions.saveRoutes(D, PLAN)).toEqual({ ok: false, error: "This day changed — rebuild first." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an unknown installer, or a plan for another day", async () => {
    day.saveRoutePlan.mockResolvedValueOnce("unknown-installer");
    expect(await actions.saveRoutes(D, PLAN)).toEqual({ ok: false, error: "An installer on this route no longer exists. Build again." });
    expect(await actions.saveRoutes("2026-09-25", PLAN)).toEqual({ ok: false, error: "That route could not be read. Build again." });
  });
});

import { describe, it, expect } from "vitest";
import { buildSteps, isPortalStatus, PORTAL_STAGES, PORTAL_STATUSES, toPortalStage } from "@/lib/portal/progress";

describe("portal stages", () => {
  it("are quoted through installed, in order", () => {
    expect(PORTAL_STAGES).toEqual(["quoted", "sold", "ordered", "installed"]);
  });

  it("show a customer quoted through completed, never earlier stages or lost", () => {
    expect(PORTAL_STATUSES).toEqual(["quoted", "sold", "ordered", "installed", "completed"]);
    for (const stage of ["new", "visit_booked", "lost"] as const) expect(isPortalStatus(stage)).toBe(false);
    for (const stage of PORTAL_STATUSES) expect(isPortalStatus(stage)).toBe(true);
  });

  it("show a completed job as installed", () => {
    expect(toPortalStage("completed")).toBe("installed");
    expect(toPortalStage("sold")).toBe("sold");
  });
});

const states = (steps: ReturnType<typeof buildSteps>) => steps.map((s) => s.state);
const dates = (steps: ReturnType<typeof buildSteps>) => steps.map((s) => s.on);
const step = (steps: ReturnType<typeof buildSteps>, key: string) => steps.find((s) => s.key === key)!;

describe("buildSteps", () => {
  it("uses the mockup's seven labels, in order", () => {
    expect(buildSteps({ status: "quoted" }).map((s) => s.label)).toEqual([
      "Consultation", "Measurements", "Quote Ready", "Order Confirmed",
      "In Production", "Ready to Install", "Installed",
    ]);
    expect(buildSteps({ status: "quoted" }).map((s) => s.key)).toEqual([
      "consultation", "measurements", "quote", "order", "production", "ready", "installed",
    ]);
  });

  it("leaves a brand-new job with every step upcoming and no dates", () => {
    const steps = buildSteps({ status: "new" });
    expect(states(steps)).toEqual(["upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(dates(steps)).toEqual([null, null, null, null, null, null, null]);
  });

  it("renders with no measurements, no appointments and no stage events", () => {
    const steps = buildSteps({ status: "quoted" });
    expect(steps).toHaveLength(7);
    expect(dates(steps)).toEqual([null, null, null, null, null, null, null]);
    expect(step(steps, "quote").state).toBe("done");
  });

  it("dates the consultation from the confirmed appointment, else the stage event", () => {
    expect(step(buildSteps({
      status: "quoted",
      visitAt: new Date("2026-09-13T17:00:00Z"),
      stageDates: { visit_booked: new Date("2026-09-01T17:00:00Z") },
    }), "consultation").on).toBe("Sep 13");

    expect(step(buildSteps({
      status: "quoted",
      stageDates: { visit_booked: new Date("2026-09-01T17:00:00Z") },
    }), "consultation").on).toBe("Sep 1");
  });

  it("marks measurements done and dated, with Quote Ready next, before a quote exists", () => {
    const steps = buildSteps({
      status: "visit_booked",
      visitAt: new Date("2026-09-10T17:00:00Z"),
      lastMeasuredAt: new Date("2026-09-13T17:00:00Z"),
    });
    expect(step(steps, "measurements").state).toBe("done");
    expect(step(steps, "measurements").on).toBe("Sep 13");
    expect(step(steps, "quote").state).toBe("current");
    expect(step(steps, "order").state).toBe("upcoming");
  });

  it("shows a sold job as Order Confirmed done and In Production next", () => {
    const steps = buildSteps({
      status: "sold",
      stageDates: {
        quoted: new Date("2026-09-10T17:00:00Z"),
        sold: new Date("2026-09-14T17:00:00Z"),
      },
    });
    expect(step(steps, "quote").state).toBe("done");
    expect(step(steps, "quote").on).toBe("Sep 10");
    expect(step(steps, "order").state).toBe("done");
    expect(step(steps, "order").on).toBe("Sep 14");
    expect(step(steps, "production").state).toBe("current");
    expect(step(steps, "ready").state).toBe("upcoming");
  });

  it("dates In Production from the order date", () => {
    const steps = buildSteps({ status: "ordered", orderedOn: "2026-09-15" });
    expect(step(steps, "production").state).toBe("done");
    expect(step(steps, "production").on).toBe("Sep 15");
  });

  it("dates Ready to Install from a confirmed install appointment", () => {
    const steps = buildSteps({
      status: "ordered",
      orderedOn: "2026-09-15",
      installAppointmentAt: new Date("2026-10-13T17:00:00Z"),
    });
    expect(step(steps, "ready").state).toBe("done");
    expect(step(steps, "ready").on).toBe("Oct 13");
    expect(step(steps, "installed").state).toBe("current");
  });

  it("leaves Ready to Install undated with no install appointment", () => {
    const steps = buildSteps({ status: "ordered", orderedOn: "2026-09-15" });
    expect(step(steps, "ready").on).toBeNull();
    expect(step(steps, "installed").on).toBeNull();
  });

  it("shows a completed job as every step done, installed on the install date", () => {
    const steps = buildSteps({
      status: "completed",
      visitAt: new Date("2026-09-01T17:00:00Z"),
      lastMeasuredAt: new Date("2026-09-03T17:00:00Z"),
      orderedOn: "2026-09-15",
      installOn: "2026-10-13",
      installAppointmentAt: new Date("2026-10-13T17:00:00Z"),
      stageDates: {
        quoted: new Date("2026-09-05T17:00:00Z"),
        sold: new Date("2026-09-08T17:00:00Z"),
        installed: new Date("2026-10-20T17:00:00Z"),
      },
    });
    expect(states(steps)).toEqual(["done", "done", "done", "done", "done", "done", "done"]);
    expect(step(steps, "installed").on).toBe("Oct 13");
  });

  it("dates Installed from the stage event when no install date is set", () => {
    const steps = buildSteps({
      status: "installed",
      stageDates: { installed: new Date("2026-10-20T17:00:00Z") },
    });
    expect(step(steps, "installed").on).toBe("Oct 20");
  });

  it("treats steps skipped along the way as done, so the tracker never goes backwards", () => {
    const steps = buildSteps({ status: "sold" });
    expect(step(steps, "measurements").state).toBe("done");
    expect(step(steps, "measurements").on).toBeNull();
    expect(step(steps, "production").state).toBe("current");
  });

  it("dates steps by the Las Vegas day, not the UTC one", () => {
    // 9pm Pacific on Sep 13 is already Sep 14 in UTC.
    const lateEvening = new Date("2026-09-14T04:00:00Z");
    expect(step(buildSteps({ status: "sold", stageDates: { sold: lateEvening } }), "order").on).toBe("Sep 13");
    expect(step(buildSteps({ status: "quoted", lastMeasuredAt: lateEvening }), "measurements").on).toBe("Sep 13");
  });

  it("never shifts a date-only column across time zones", () => {
    expect(step(buildSteps({ status: "ordered", orderedOn: "2026-01-01" }), "production").on).toBe("Jan 1");
    expect(step(buildSteps({ status: "installed", installOn: "2026-01-01" }), "installed").on).toBe("Jan 1");
  });
});

describe("a date that has not happened yet", () => {
  it("marks a done step whose date is still to come", () => {
    const steps = buildSteps({
      status: "ordered",
      orderedOn: "2025-09-20",
      installAppointmentAt: new Date("2099-10-13T17:00:00Z"),
    });
    const ready = step(steps, "ready");
    expect(ready.state).toBe("done");
    expect(ready.on).toBe("Oct 13");
    expect(ready.future).toBe(true);

    const production = step(steps, "production");
    expect(production.on).toBe("Sep 20");
    expect(production.future).toBe(false);
  });

  it("leaves a step with no date as not future", () => {
    expect(step(buildSteps({ status: "quoted" }), "ready").future).toBe(false);
  });
});

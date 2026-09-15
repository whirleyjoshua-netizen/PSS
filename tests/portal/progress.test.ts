import { describe, it, expect } from "vitest";
import { formatInstallDay, isPortalStage, progressSteps, PORTAL_STAGES } from "@/lib/portal/progress";

describe("portal stages", () => {
  it("are quoted through installed, in order", () => {
    expect(PORTAL_STAGES).toEqual(["quoted", "sold", "ordered", "installed"]);
  });

  it("exclude every earlier stage and lost", () => {
    for (const stage of ["new", "visit_booked", "lost"] as const) {
      expect(isPortalStage(stage)).toBe(false);
    }
    for (const stage of PORTAL_STAGES) expect(isPortalStage(stage)).toBe(true);
  });
});

describe("progressSteps", () => {
  it("uses customer wording", () => {
    expect(progressSteps("quoted", null).map((s) => s.label)).toEqual([
      "Quote ready", "Order confirmed", "In production", "Installed",
    ]);
  });

  it("marks earlier steps done, the current one current, and later ones upcoming", () => {
    expect(progressSteps("ordered", null).map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
  });

  it("explains the quote step", () => {
    expect(progressSteps("quoted", null)[0].detail).toBe("We've put together your quote.");
  });

  it("shows the install date while in production, once it is set", () => {
    expect(progressSteps("ordered", "2026-10-13")[2].detail).toBe("Install scheduled: Tue, Oct 13");
    expect(progressSteps("ordered", null)[2].detail).toBeNull();
  });

  it("shows the install day once installed", () => {
    expect(progressSteps("installed", "2026-10-13")[3].detail).toBe("Installed Tue, Oct 13");
    expect(progressSteps("installed", null)[3].detail).toBeNull();
  });

  it("puts a detail only on the current step", () => {
    const steps = progressSteps("installed", "2026-10-13");
    expect(steps.slice(0, 3).every((s) => s.detail === null)).toBe(true);
  });

  it("formats a date without shifting it across time zones", () => {
    expect(formatInstallDay("2026-01-01")).toBe("Thu, Jan 1");
  });
});

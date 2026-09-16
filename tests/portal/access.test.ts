import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { normalizeEmail, toProject, visibleJobs } = await import("@/lib/portal/access");

const row = (over: Record<string, unknown> = {}) => ({
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", created_at: "2026-09-01T00:00:00Z", name: "Maria  Lopez",
  phone: "7025550100", email: "maria@example.com", address: "12 Palm Way", city: "Henderson",
  treatments: [], window_count: null, heard_via: null, notes: "gate code 1234", source: "website",
  status: "quoted", stage_changed_at: "2026-09-02T00:00:00Z", visit_at: null, quote_cents: 450000,
  sold_cents: 420000, deposit_cents: 100000, brands: [], ordered_on: null, install_on: "2026-10-13",
  lost_reason: null, referral_code: null, referred_by: null, referral_paid_at: null,
  review_requested_at: null, review_opt_out: false, project_no: 1048, budget_tier: "premium",
  gate_code: "#4321", window_count_exact: 9, treatment_types: ["shutters"], finish: "luxury", ...over,
});

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Maria@Example.COM ")).toBe("maria@example.com");
    expect(normalizeEmail(null)).toBe("");
  });
});

describe("visibleJobs", () => {
  it("matches the normalized email against the normalized column, portal stages only", async () => {
    query.mockResolvedValue([row()]);
    const jobs = await visibleJobs(" Maria@Example.com ");

    const [text, params] = query.mock.calls[0];
    expect(text).toContain("lower(trim(email)) = $1");
    expect(text).toContain("status = any($2::text[])");
    expect(params).toEqual(["maria@example.com", ["quoted", "sold", "ordered", "installed", "completed"]]);
    expect(jobs.map((j) => j.id)).toEqual(["3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c"]);
  });

  it("returns nothing for a blank email without querying", async () => {
    expect(await visibleJobs("   ")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("toProject", () => {
  it("keeps only what a customer may see", async () => {
    query.mockResolvedValue([row({ lost_reason: "Went with a cheaper quote" })]);
    const [job] = await visibleJobs("maria@example.com");
    const project = toProject(job, {});

    expect(project).toEqual({
      id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", firstName: "Maria", address: "12 Palm Way",
      city: "Henderson", status: "quoted", installOn: "2026-10-13", projectNo: "PSS-1048",
      windowCount: 9, treatmentTypes: ["shutters"], finish: "luxury", orderedOn: null,
      steps: [
        // Measurements is behind the customer but never happened, so it is not reached: the
        // tracker leaves it unticked rather than claiming work nobody did.
        { key: "consultation", label: "Consultation", reached: true, state: "done", on: null, future: false },
        { key: "measurements", label: "Measurements", reached: false, state: "done", on: null, future: false },
        { key: "quote", label: "Quote Ready", reached: true, state: "current", on: null, future: false },
        { key: "order", label: "Order Confirmed", reached: false, state: "upcoming", on: null, future: false },
        { key: "production", label: "In Production", reached: false, state: "upcoming", on: null, future: false },
        { key: "ready", label: "Ready to Install", reached: false, state: "upcoming", on: null, future: false },
        { key: "installed", label: "Installed", reached: false, state: "upcoming", on: null, future: false },
      ],
    });

    // The private fields on the job must not reach the customer, in any form.
    const json = JSON.stringify(project);
    expect(json).not.toMatch(/cents|4500|4200|1000|notes|gate code|1234|4321|cheaper quote|premium|website|7025550100|maria@example\.com/i);
    for (const secret of ["gate code 1234", "#4321", "Went with a cheaper quote", "premium", "450000", "7025550100"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("dates the steps from the timeline it is given, and never from an event body", async () => {
    query.mockResolvedValue([row({ status: "sold", ordered_on: null })]);
    const [job] = await visibleJobs("maria@example.com");
    const project = toProject(job, {
      lastMeasuredAt: new Date("2026-09-13T17:00:00Z"),
      installAppointmentAt: new Date("2026-10-13T17:00:00Z"),
      stageDates: { quoted: new Date("2026-09-10T17:00:00Z"), sold: new Date("2026-09-14T17:00:00Z") },
    });

    const byKey = Object.fromEntries(project.steps.map((s) => [s.key, s]));
    expect(byKey.measurements.on).toBe("Sep 13");
    expect(byKey.quote.on).toBe("Sep 10");
    // The job is sold, so Order Confirmed is the furthest step reached: it is the current one.
    expect(byKey.order).toEqual({
      key: "order", label: "Order Confirmed", reached: true, state: "current", on: "Sep 14", future: false,
    });
    // The job is only sold, so a booked install does not tick Ready to Install — and cannot
    // drag In Production done with it. The date still reaches the page's Installation section.
    expect(byKey.ready.on).toBeNull();
    expect(byKey.ready.state).not.toBe("done");
    expect(byKey.production.state).not.toBe("done");
    expect(JSON.stringify(project)).not.toMatch(/gate code|cheaper quote/i);
  });

  it("carries the customer's own order details and nothing more", async () => {
    query.mockResolvedValue([row({ ordered_on: "2026-09-15", window_count_exact: null, treatment_types: [], finish: null })]);
    const [job] = await visibleJobs("maria@example.com");
    const project = toProject(job, {});
    expect(project.orderedOn).toBe("2026-09-15");
    expect(project.windowCount).toBeNull();
    expect(project.treatmentTypes).toEqual([]);
    expect(project.finish).toBeNull();
  });

  it("shows the project number as PSS-#### and a missing one as null", async () => {
    query.mockResolvedValue([row({ project_no: 7 })]);
    const [small] = await visibleJobs("maria@example.com");
    expect(toProject(small, {}).projectNo).toBe("PSS-0007");

    query.mockResolvedValue([row({ project_no: null })]);
    const [none] = await visibleJobs("maria@example.com");
    expect(toProject(none, {}).projectNo).toBeNull();
  });

  it("shows a completed job to the customer as installed", async () => {
    query.mockResolvedValue([row({ status: "completed" })]);
    const [job] = await visibleJobs("maria@example.com");
    expect(toProject(job, {}).status).toBe("installed");
  });
});

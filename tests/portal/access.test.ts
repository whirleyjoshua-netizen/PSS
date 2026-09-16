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
  gate_code: "#4321", ...over,
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
    const project = toProject(job);

    expect(project).toEqual({
      id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", firstName: "Maria", address: "12 Palm Way",
      city: "Henderson", status: "quoted", installOn: "2026-10-13", projectNo: "PSS-1048",
    });

    // The private fields on the job must not reach the customer, in any form.
    const json = JSON.stringify(project);
    expect(json).not.toMatch(/cents|4500|4200|1000|notes|gate code|1234|4321|cheaper quote|premium|website|7025550100|maria@example\.com/i);
    for (const secret of ["gate code 1234", "#4321", "Went with a cheaper quote", "premium", "450000", "7025550100"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("shows the project number as PSS-#### and a missing one as null", async () => {
    query.mockResolvedValue([row({ project_no: 7 })]);
    const [small] = await visibleJobs("maria@example.com");
    expect(toProject(small).projectNo).toBe("PSS-0007");

    query.mockResolvedValue([row({ project_no: null })]);
    const [none] = await visibleJobs("maria@example.com");
    expect(toProject(none).projectNo).toBeNull();
  });

  it("shows a completed job to the customer as installed", async () => {
    query.mockResolvedValue([row({ status: "completed" })]);
    const [job] = await visibleJobs("maria@example.com");
    expect(toProject(job).status).toBe("installed");
  });
});

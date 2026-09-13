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
  review_requested_at: null, review_opt_out: false, ...over,
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
    expect(params).toEqual(["maria@example.com", ["quoted", "sold", "ordered", "installed"]]);
    expect(jobs.map((j) => j.id)).toEqual(["3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c"]);
  });

  it("returns nothing for a blank email without querying", async () => {
    expect(await visibleJobs("   ")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("toProject", () => {
  it("keeps only what a customer may see", async () => {
    query.mockResolvedValue([row()]);
    const [job] = await visibleJobs("maria@example.com");
    const project = toProject(job);

    expect(project).toEqual({
      id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", firstName: "Maria", address: "12 Palm Way",
      city: "Henderson", status: "quoted", installOn: "2026-10-13",
    });
    expect(JSON.stringify(project)).not.toMatch(/cents|4500|notes|gate code/);
  });
});

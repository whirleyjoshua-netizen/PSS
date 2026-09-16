import { describe, it, expect, vi, beforeEach } from "vitest";

// Reads use sql.query (the column list is SQL text); writes use the tagged template.
const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const geocodeLead = vi.fn();
vi.mock("@/lib/routes/geocode", () => ({ geocodeLead }));
// after() runs the callback at once, and swallows its rejection as Next does.
const after = vi.fn((cb: () => unknown) => { (cb() as Promise<unknown> | undefined)?.catch?.(() => {}); });
vi.mock("next/server", () => ({ after }));

const jobs = await import("@/lib/admin/jobs");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

const row = {
  id: ID, created_at: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: null, city: "Henderson", treatments: ["Shades"],
  window_count: null, heard_via: null, notes: null, source: "contact", status: "quoted",
  stage_changed_at: new Date("2026-09-05T00:00:00Z"), visit_at: null, quote_cents: 450000,
  sold_cents: null, deposit_cents: null, brands: [], ordered_on: null, install_on: null, lost_reason: null,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
  geocodeLead.mockReset().mockResolvedValue(undefined);
  after.mockClear();
});

describe("reading jobs", () => {
  it("maps database rows to camelCase jobs", async () => {
    sql.query.mockResolvedValue([row]);
    const [job] = await jobs.listJobs({});
    expect(job).toMatchObject({ id: ID, status: "quoted", quoteCents: 450000, stageChangedAt: row.stage_changed_at });
  });

  it("lists every job, lost included", async () => {
    await jobs.listJobs({});
    const [statement, params] = sql.query.mock.calls[0];
    expect(statement).not.toMatch(/status\s*(<>|!=|not in)/i);
    expect(params ?? []).toEqual([]);
  });

  it("returns null for an id that is not a uuid, without querying", async () => {
    expect(await jobs.getJob("../etc")).toBeNull();
    expect(sql.query).not.toHaveBeenCalled();
  });
});

describe("changing jobs", () => {
  it("moves the stage and logs who did it in one statement", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    const ok = await jobs.setStage(ID, "sold", "owner@example.com");
    expect(ok).toBe(true);
    expect(sql).toHaveBeenCalledOnce();
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("update leads");
    expect(statement).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "sold", "owner@example.com"]));
  });

  it("refuses a stage that does not exist", async () => {
    await expect(jobs.setStage(ID, "shipped" as never, "owner@example.com")).rejects.toThrow(/stage/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("records the lost reason with the stage change", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.setStage(ID, "lost", "owner@example.com", "Went with a cheaper quote");
    expect(sql.mock.calls[0]).toContain("Went with a cheaper quote");
  });

  it("clears the follow-up when moving to lost", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.setStage(ID, "lost", "owner@example.com", "Went with a cheaper quote");
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("follow_up_at = case when");
  });

  it("passes a typed boolean, not the stage value, into the follow-up clearing CASE", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.setStage(ID, "lost", "owner@example.com", "Went with a cheaper quote");
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("::boolean then null else follow_up_at end");
    expect(statement).toContain("::boolean then null else follow_up_note end");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([true]));

    sql.mockResolvedValue([{ id: ID }]);
    await jobs.setStage(ID, "sold", "owner@example.com");
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining([false]));
  });

  it("returns false for a missing job or an unchanged stage, without a uuid check hitting the db first", async () => {
    sql.mockResolvedValue([]);
    expect(await jobs.setStage(ID, "sold", "owner@example.com")).toBe(false);
  });

  it("setStage, updateDetails and addNote return false for a non-uuid id without querying", async () => {
    expect(await jobs.setStage("../etc", "sold", "owner@example.com")).toBe(false);
    expect(await jobs.updateDetails("../etc", { address: null, city: "Henderson", quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, budgetTier: null, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null }, "owner@example.com")).toEqual({ saved: false, addressChanged: false });
    expect(await jobs.addNote("../etc", "hi", "owner@example.com")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("logs a note against the job and returns whether it was saved", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    const ok = await jobs.addNote(ID, "Wants the patio in spring", "owner@example.com");
    expect(ok).toBe(true);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("from leads");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "owner@example.com", "Wants the patio in spring"]));
  });

  it("addNote returns false when the job does not exist", async () => {
    sql.mockResolvedValue([]);
    expect(await jobs.addNote(ID, "hi", "owner@example.com")).toBe(false);
  });

  it("addContact logs a contact event against an existing job only", async () => {
    sql.mockResolvedValue([{ id: "e1" }]);
    expect(await jobs.addContact(ID, "Contacted · Called", "owner@example.com")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("'contact'");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "owner@example.com", "Contacted · Called"]));
    expect(await jobs.addContact("../etc", "x", "o")).toBe(false);
  });

  it("computes last contacted from contact events and call logs", () => {
    expect(jobs.JOB_COLUMNS).toMatch(/\(select max\(e\.created_at\) from job_events e where e\.lead_id = leads\.id and \(e\.kind = 'contact' or \(e\.kind = 'note' and e\.body like 'Call:%'\)\)\) as last_contact_at/);
    expect(jobs.toJob({ ...row, last_contact_at: "2026-09-15T17:00:00Z" }).lastContactAt).toEqual(new Date("2026-09-15T17:00:00Z"));
    expect(jobs.toJob({ ...row }).lastContactAt).toBeNull();
  });

  it("updateDetails saves the questionnaire fields", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.updateDetails(ID, {
      address: null, city: "Henderson", quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, budgetTier: null,
      windowCountExact: 12, treatmentTypes: ["shutters"], motorized: true, gateCode: "#4321",
    }, "owner@example.com");
    const call = sql.mock.calls[0];
    const statement = text(call).replace(/\s+/g, " ");
    expect(statement).toContain("window_count_exact = ?, treatment_types = ?::text[], motorized = ?, gate_code = ?");
    expect(call).toEqual(expect.arrayContaining([12, ["shutters"], "#4321"]));
  });

  it("updateDetails saves the parsed values", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    const result = await jobs.updateDetails(
      ID,
      { address: null, city: "Henderson", quoteCents: 450000, soldCents: null, depositCents: 225000, brands: ["Alta Window Fashions"], orderedOn: "2027-01-10", budgetTier: null, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null },
      "owner@example.com",
    );
    expect(result).toEqual({ saved: true, addressChanged: false });
    expect(sql).toHaveBeenCalledOnce();
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([450000, 225000, ["Alta Window Fashions"]]));
  });

  it("updateDetails leaves the appointment dates and the stage alone", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.updateDetails(ID, {
      address: null, city: "Henderson", quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, budgetTier: null,
      windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null,
    }, "owner@example.com");
    const statement = text(sql.mock.calls[0]).replace(/\s+/g, " ");
    expect(statement).not.toContain("visit_at");
    expect(statement).not.toContain("install_on");
    expect(statement).not.toContain("visit_booked");
    expect(statement).toContain("ordered_on");
  });

  it("updateDetails reports a job that does not exist", async () => {
    sql.mockResolvedValue([]);
    const result = await jobs.updateDetails(
      ID,
      { address: null, city: "Henderson", quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, budgetTier: null, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null },
      "owner@example.com",
    );
    expect(result).toEqual({ saved: false, addressChanged: false });
  });

  it("updateDetails saves the address and city, and reports whether they changed from before the update", async () => {
    sql.mockResolvedValue([{ id: ID, address_changed: true }]);
    const input = {
      address: "12 Sample St", city: "Henderson", quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null,
      budgetTier: null, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null,
    };
    expect(await jobs.updateDetails(ID, input, "owner@example.com")).toEqual({ saved: true, addressChanged: true });
    const statement = text(sql.mock.calls[0]).replace(/\s+/g, " ");
    expect(statement).toContain("address = ?, city = ?");
    // A moved job loses its old coordinates in the same update, so the planner never routes to the old address.
    for (const column of ["lat", "lng", "geocode_status", "geocoded_at"]) {
      expect(statement).toContain(`${column} = case when address is distinct from ?::text or city is distinct from ?::text then null else ${column} end`);
    }
    expect(statement).toContain("with prev as (select address, city from leads where id = ?), changed as ( update leads set");
    expect(statement).toContain("(prev.address is distinct from ?::text or prev.city is distinct from ?::text) as address_changed");
    expect(statement).toContain("from changed, prev");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["12 Sample St", "Henderson"]));
    sql.mockResolvedValue([{ id: ID, address_changed: false }]);
    expect(await jobs.updateDetails(ID, input, "owner@example.com")).toEqual({ saved: true, addressChanged: false });
    sql.mockResolvedValue([]);
    expect(await jobs.updateDetails(ID, input, "owner@example.com")).toEqual({ saved: false, addressChanged: false });
  });

  it("createJob schedules a geocode of the new job, so every caller gets coordinates", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", address: "12 Sample St", source: "phone", stage: "new" },
      "owner@example.com",
    );
    expect(after).toHaveBeenCalledOnce();
    expect(geocodeLead).toHaveBeenCalledWith(ID);
  });

  it("createJob still returns the id when the geocode fails", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    geocodeLead.mockRejectedValue(new Error("google down"));
    await expect(jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "new" },
      "owner@example.com",
    )).resolves.toBe(ID);
  });

  it("createJob still returns the id when after() throws outside a request", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    after.mockImplementationOnce(() => { throw new Error("`after` was called outside a request scope"); });
    await expect(jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "new" },
      "owner@example.com",
    )).resolves.toBe(ID);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("updateDetails saves the budget tier", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.updateDetails(ID, {
      address: null, city: "Henderson", quoteCents: null, soldCents: null, depositCents: null,
      brands: [], orderedOn: null, budgetTier: "mid",
      windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null,
    }, "owner@example.com");
    const call = sql.mock.calls.at(-1)!;
    expect((call[0] as TemplateStringsArray).join("?")).toContain("budget_tier = ");
    expect(call).toContain("mid");
  });

  it("toJob maps budget_tier, and unknown or missing values to null", () => {
    expect(jobs.toJob({ ...row, budget_tier: "premium" }).budgetTier).toBe("premium");
    expect(jobs.toJob({ ...row, budget_tier: "luxury" }).budgetTier).toBeNull();
    expect(jobs.toJob({ ...row }).budgetTier).toBeNull();
  });

  it("toJob maps follow_up_at and follow_up_note, and missing values to null", () => {
    const at = new Date("2026-10-16T17:00:00Z");
    expect(jobs.toJob({ ...row, follow_up_at: at, follow_up_note: "checking with husband" }))
      .toMatchObject({ followUpAt: at, followUpNote: "checking with husband" });
    expect(jobs.toJob({ ...row })).toMatchObject({ followUpAt: null, followUpNote: null });
  });

  it("toJob maps the questionnaire fields and drops unknown values", () => {
    const job = jobs.toJob({ ...row, window_count_exact: 12, treatment_types: ["shutters", "curtains"], motorized: true, gate_code: "#4321", finish: "luxury" });
    expect(job).toMatchObject({ windowCountExact: 12, treatmentTypes: ["shutters"], motorized: true, gateCode: "#4321", finish: "luxury" });
    expect(jobs.toJob({ ...row })).toMatchObject({ windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null, finish: null });
    expect(jobs.toJob({ ...row, finish: "cheap" }).finish).toBeNull();
  });

  it("selects and maps the project number, and a row without one maps to null", () => {
    expect(jobs.JOB_COLUMNS).toContain("project_no");
    expect(jobs.toJob({ ...row, project_no: 1048 }).projectNo).toBe(1048);
    expect(jobs.toJob({ ...row }).projectNo).toBeNull();
  });

  it("never selects the questionnaire key into a Job", () => {
    expect(jobs.JOB_COLUMNS).toContain("gate_code");
    expect(jobs.JOB_COLUMNS).not.toContain("questionnaire_");
  });

  it("creates a hand-entered job and returns its id", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    const id = await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "new" },
      "owner@example.com",
    );
    expect(id).toBe(ID);
    expect(text(sql.mock.calls[0])).toContain("insert into leads");
  });

  it("creates a hand-entered job in the chosen stage and logs it", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "quoted" },
      "owner@example.com",
    );
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("status");
    expect(sql.mock.calls[0].filter((v: unknown) => v === "quoted")).toHaveLength(2);
  });

  it("a job created as installed sets review_opt_out to true", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "installed" },
      "owner@example.com",
    );
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("review_opt_out");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([true]));
  });

  it("a job created as quoted sets review_opt_out to false", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "quoted" },
      "owner@example.com",
    );
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([false]));
    expect(sql.mock.calls[0]).not.toEqual(expect.arrayContaining([true]));
  });

  it("a job created as installed logs that the review request is off", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "installed" },
      "owner@example.com",
    );
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Added by hand (review request off)"]));
  });

  it("a job created as completed turns the review request off and says so", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "completed" },
      "owner@example.com",
    );
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([true, "Added by hand (review request off)"]));
  });

  it("a job created as quoted logs the plain 'Added by hand' body", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "quoted" },
      "owner@example.com",
    );
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Added by hand"]));
    expect(sql.mock.calls[0]).not.toEqual(expect.arrayContaining(["Added by hand (review request off)"]));
  });
});

describe("assigning jobs", () => {
  const MEMBER = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";

  it("maps the assignee fields", async () => {
    sql.query.mockResolvedValue([{ ...row, assigned_to: MEMBER, assigned_name: "Shade", assigned_role: "designer" }]);
    const [job] = await jobs.listJobs({});
    expect(job).toMatchObject({ assignedTo: MEMBER, assignedName: "Shade", assignedRole: "designer" });
  });

  it("maps an unassigned job to nulls", async () => {
    sql.query.mockResolvedValue([row]);
    const [job] = await jobs.listJobs({});
    expect(job).toMatchObject({ assignedTo: null, assignedName: null, assignedRole: null });
  });

  it("maps an unexpected role to null", () => {
    expect(jobs.toJob({ ...row, assigned_role: "designer" }).assignedRole).toBe("designer");
    expect(jobs.toJob({ ...row, assigned_role: "foreman" }).assignedRole).toBeNull();
  });

  it("selects the assignee's name and role with the job", () => {
    expect(jobs.JOB_COLUMNS).toContain("assigned_to");
    expect(jobs.JOB_COLUMNS).toContain("as assigned_name");
    expect(jobs.JOB_COLUMNS).toContain("as assigned_role");
  });

  it("assigns, logging who it went to", async () => {
    sql.mockResolvedValue([{ job: 1, member: 1, changed: 1 }]);
    expect(await jobs.assignJob(ID, MEMBER, "owner@example.com")).toBe("ok");
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("assigned_to is distinct from");
    expect(statement).toContain("'Assigned to ' || name || ' (' || initcap(role) || ')'");
    expect(statement).toContain("'Unassigned'");
  });

  it("unassigns with null", async () => {
    sql.mockResolvedValue([{ job: 1, member: 0, changed: 1 }]);
    expect(await jobs.assignJob(ID, null, "owner@example.com")).toBe("ok");
  });

  it("reports a missing job, an unknown person and a no-op", async () => {
    sql.mockResolvedValue([{ job: 0, member: 1, changed: 0 }]);
    expect(await jobs.assignJob(ID, MEMBER, "o")).toBe("missing");
    sql.mockResolvedValue([{ job: 1, member: 0, changed: 0 }]);
    expect(await jobs.assignJob(ID, MEMBER, "o")).toBe("unknown-member");
    sql.mockResolvedValue([{ job: 1, member: 1, changed: 0 }]);
    expect(await jobs.assignJob(ID, MEMBER, "o")).toBe("unchanged");
  });

  it("refuses bad ids without touching the database", async () => {
    expect(await jobs.assignJob("nope", MEMBER, "o")).toBe("missing");
    expect(await jobs.assignJob(ID, "nope", "o")).toBe("unknown-member");
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("searching jobs", () => {
  it("keeps the plain query when there is no search", async () => {
    await jobs.listJobs({ search: "   " });
    expect(sql.query.mock.calls[0][1] ?? []).toEqual([]);
  });

  it("matches name, email, city and address, and phone by digits, with parameters", async () => {
    await jobs.listJobs({ search: " Reyes 702 " });
    const [statement, params] = sql.query.mock.calls[0];
    expect(statement).toContain("name ilike $1");
    expect(statement).toContain("email ilike $1");
    expect(statement).toContain("city ilike $1");
    expect(statement).toContain("address ilike $1");
    expect(statement).toContain("phone like");
    // "Reyes 702" contains letters, so it doesn't look like a phone number: $2 is "".
    expect(params).toEqual(["%Reyes 702%", ""]);
  });

  it("does not treat digits inside an address-like term as a phone search", async () => {
    await jobs.listJobs({ search: "4521 Elm" });
    const [, params] = sql.query.mock.calls[0];
    expect(params).toEqual(["%4521 Elm%", ""]);
  });

  it("treats a phone-shaped term as a phone search", async () => {
    await jobs.listJobs({ search: "(702) 555-0134" });
    const [, params] = sql.query.mock.calls[0];
    expect(params).toEqual(["%(702) 555-0134%", "7025550134"]);
  });

  it("does not search by phone when there are fewer than 3 digits", async () => {
    await jobs.listJobs({ search: "55" });
    const [, params] = sql.query.mock.calls[0];
    expect(params).toEqual(["%55%", ""]);
  });

  it("escapes LIKE wildcards and caps the length", async () => {
    await jobs.listJobs({ search: `50%_off\\${"x".repeat(200)}` });
    const [, params] = sql.query.mock.calls[0];
    expect(params[0]).toMatch(/^%50\\%\\_off\\\\x+%$/);
    expect((params[0] as string).length).toBeLessThanOrEqual(100 + 2 + 3);
  });
});

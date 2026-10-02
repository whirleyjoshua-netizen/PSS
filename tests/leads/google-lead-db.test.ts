import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { insertGoogleLead } = await import("@/lib/leads/google-lead-db");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const lead = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c",
  googleLeadId: "g-lead-1",
  name: "Dana Reyes",
  phone: "7025550123",
  email: null,
  zip: "89052",
  city: "Henderson" as const,
  gclid: "gclid-1",
  notes: "Google lead form (form 1, campaign 2)",
  isTest: false,
  key: "k",
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([{ id: lead.id }]);
});

// Text only: the real SQL is proven on a Neon branch by scripts/verify-google-lead.ts (Task 4).
describe("insertGoogleLead", () => {
  it("is one statement: assignee from lead_settings, conflict on google_lead_id does nothing", async () => {
    expect(await insertGoogleLead(lead)).toEqual({ id: lead.id });
    expect(sql).toHaveBeenCalledOnce();
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("insert into leads");
    expect(statement).toContain("(select default_assignee from lead_settings where id)");
    expect(statement).toContain("on conflict (google_lead_id) where google_lead_id is not null do nothing");
    expect(statement).toContain("returning id");
    expect(statement).toContain("now()");
  });

  it("stores the Google lead's values, source google_form, ZIP as the address", async () => {
    await insertGoogleLead(lead);
    const values = sql.mock.calls[0].slice(1);
    for (const value of [lead.id, "Dana Reyes", "7025550123", null, "89052", "Henderson", "Google lead form",
      lead.notes, "google_form", "gclid-1", "google", "cpc", "g-lead-1"]) {
      expect(values).toContain(value);
    }
  });

  it("returns null when the lead was already stored (no row back)", async () => {
    sql.mockResolvedValue([]);
    expect(await insertGoogleLead(lead)).toBeNull();
  });
});

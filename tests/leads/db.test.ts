import { describe, it, expect, vi } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { insertLead } = await import("@/lib/leads/db");

describe("insertLead", () => {
  it("inserts the id it was given", async () => {
    sql.mockResolvedValue([{ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" }]);
    await insertLead({ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana", phone: "7025550134",
      email: "d@example.com", city: "Henderson", source: "hero" });
    const call = sql.mock.calls[0];
    expect((call[0] as TemplateStringsArray).join("?")).toMatch(/insert into leads\s*\(\s*id,/);
    expect(call).toContain("3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
  });

  it("stores the questionnaire key's hash with a one-day expiry", async () => {
    sql.mockClear().mockResolvedValue([{ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" }]);
    await insertLead({ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana", phone: "7025550134",
      email: "d@example.com", city: "Henderson", source: "hero", questionnaireTokenHash: "abc123" });
    const call = sql.mock.calls[0];
    const text = (call[0] as TemplateStringsArray).join("?");
    expect(text).toContain("questionnaire_token_hash, questionnaire_expires_at");
    expect(text).toContain("now() + interval '24 hours'");
    expect(call).toContain("abc123");
  });
  it("assigns the new lead to the default from Settings, inside the insert itself", async () => {
    sql.mockClear().mockResolvedValue([{ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" }]);
    await insertLead({ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana", phone: "7025550134",
      email: "d@example.com", city: "Henderson", source: "hero" });
    expect(sql).toHaveBeenCalledTimes(1);
    const text = (sql.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(text).toMatch(/questionnaire_expires_at, assigned_to,/);
    expect(text).toMatch(/end,\s*\(select default_assignee from lead_settings where id\),/);
  });

  it("stores the ad click's gclid and campaign", async () => {
    sql.mockClear().mockResolvedValue([{ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" }]);
    await insertLead({ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana", phone: "7025550134",
      email: "d@example.com", city: "Henderson", source: "hero",
      attribution: { gclid: "Cj0abc", utmCampaign: "Custom Blinds", clickedAt: "2026-09-14T20:05:00.000Z" } });
    const call = sql.mock.calls[0];
    const text = (call[0] as TemplateStringsArray).join("?");
    expect(text).toContain("gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_term, landing_page, ad_clicked_at");
    // The ad columns close both lists, so the last nine values line up with them in order.
    expect(text).toMatch(/ad_clicked_at\)\s*values/);
    expect(call.slice(-9)).toEqual(["Cj0abc", null, null, null, null, "Custom Blinds", null, null, "2026-09-14T20:05:00.000Z"]);
  });
});

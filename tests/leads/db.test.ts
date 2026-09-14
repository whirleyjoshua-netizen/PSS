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
});

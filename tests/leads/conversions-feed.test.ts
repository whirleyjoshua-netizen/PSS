import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { conversionsCsvNow } = await import("@/lib/leads/conversions-feed");

beforeEach(() => { query.mockReset(); });

describe("conversionsCsvNow", () => {
  it("reads ad-click leads inside the 90-day window and writes them as the conversions file", async () => {
    query.mockResolvedValue([
      { gclid: "Cj0abc", created_at: "2026-09-14T20:05:00Z", sold_cents: 245000,
        booked_at: "2026-09-15T17:00:00Z", sold_at: "2026-09-20T18:30:00Z" },
      { gclid: "Cj0def", created_at: "2026-09-16T10:00:00Z", sold_cents: null, booked_at: null, sold_at: null },
    ]);
    expect((await conversionsCsvNow()).split("\n")).toEqual([
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
      "Cj0abc,Consultation request,2026-09-14 20:05:00+00:00,,",
      "Cj0abc,Appointment booked,2026-09-15 17:00:00+00:00,,",
      "Cj0abc,Sale,2026-09-20 18:30:00+00:00,2450.00,USD",
      "Cj0def,Consultation request,2026-09-16 10:00:00+00:00,,",
      "",
    ]);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("l.gclid is not null");
    expect(text).toContain("coalesce(l.ad_clicked_at, l.created_at) > now() - make_interval(days => $1)");
    expect(params).toEqual([90]);
  });

  it("writes just the header when there are no ad-click leads", async () => {
    query.mockResolvedValue([]);
    expect(await conversionsCsvNow()).toBe(
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\n");
  });
});

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
      { gclid: "Cj0goo", source: "google_form", created_at: "2026-09-17T10:00:00Z", sold_cents: null,
        booked_at: "2026-09-18T15:00:00Z", sold_at: null },
    ]);
    expect((await conversionsCsvNow()).split("\n")).toEqual([
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
      "Cj0abc,Consultation request,2026-09-14 20:05:00+00:00,,",
      "Cj0abc,Appointment booked,2026-09-15 17:00:00+00:00,,",
      "Cj0abc,Sale,2026-09-20 18:30:00+00:00,2450.00,USD",
      "Cj0def,Consultation request,2026-09-16 10:00:00+00:00,,",
      "Cj0goo,Appointment booked,2026-09-18 15:00:00+00:00,,",
      "",
    ]);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("l.gclid is not null");
    expect(text).toMatch(/select l\.gclid, l\.source,/);
    expect(text).toContain("coalesce(l.ad_clicked_at, l.created_at) > now() - make_interval(days => $1)");
    expect(params[0]).toBe(90);
  });

  it("counts booked from Appointment booked on and sold from Sold on, from the one stage list", async () => {
    query.mockResolvedValue([]);
    await conversionsCsvNow();
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    expect(text).toContain("e.to_status = any($2::text[])) as booked_at");
    expect(text).toContain("e.to_status = any($3::text[])) as sold_at");
    expect(text).not.toMatch(/to_status in \(/);
    expect(params).toEqual([
      90,
      ["visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"],
      ["sold", "measure", "ordered", "installed", "completed"],
    ]);
    // The new stages count: approved, signed and measure are booked; measure is sold; signed is not sold.
    const [booked, sold] = [params[1] as string[], params[2] as string[]];
    for (const stage of ["approved", "signed", "measure"]) expect(booked).toContain(stage);
    expect(sold).toContain("measure");
    expect(sold).not.toContain("signed");
  });

  it("writes just the header when there are no ad-click leads", async () => {
    query.mockResolvedValue([]);
    expect(await conversionsCsvNow()).toBe(
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\n");
  });
});

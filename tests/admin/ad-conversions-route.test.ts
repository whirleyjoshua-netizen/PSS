import { describe, expect, it, vi } from "vitest";

const query = vi.fn(async (..._args: unknown[]) => [] as Record<string, unknown>[]);
vi.mock("@/lib/db", () => ({ db: () => ({ query }) }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));

const { GET } = await import("@/app/admin/ad-conversions/route");

describe("GET /admin/ad-conversions", () => {
  it("counts booked from Appointment booked on and sold from Sold on, from the one stage list", async () => {
    await GET();
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    expect(text).toContain("e.to_status = any($2::text[])) as booked_at");
    expect(text).toContain("e.to_status = any($3::text[])) as sold_at");
    expect(params[1]).toEqual(["visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"]);
    expect(params[2]).toEqual(["sold", "measure", "ordered", "installed", "completed"]);
  });
});

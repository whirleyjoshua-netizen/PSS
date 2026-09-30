// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const conversionsCsvNow = vi.fn();
vi.mock("@/lib/leads/conversions-feed", () => ({ conversionsCsvNow }));
const { GET } = await import("@/app/admin/ad-conversions/route");

const CSV = "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\nx,Sale,2026-09-20 18:30:00+00:00,,\n";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  conversionsCsvNow.mockReset().mockResolvedValue(CSV);
});

describe("admin ad-conversions download", () => {
  it("reads nothing without an admin session", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT");
    expect(conversionsCsvNow).not.toHaveBeenCalled();
  });

  it("downloads the shared conversions file as an attachment", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CSV);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="google-ads-conversions.csv"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(conversionsCsvNow).toHaveBeenCalledTimes(1);
  });
});

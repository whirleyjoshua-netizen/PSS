import { describe, it, expect, vi, beforeEach } from "vitest";

const runDailyReviewRequests = vi.fn();
vi.mock("@/lib/reviews/send", () => ({ runDailyReviewRequests }));

const { GET } = await import("@/app/api/cron/review-requests/route");
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/review-requests", {
    headers: authorization ? { authorization } : {},
  }));

beforeEach(() => {
  runDailyReviewRequests.mockReset().mockResolvedValue({ sent: 2, failed: 0 });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("GET /api/cron/review-requests", () => {
  it("runs and reports counts with the right secret", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 2, failed: 0 });
  });

  it.each([undefined, "Bearer wrong", "s3cret"])("rejects %s without running", async (header) => {
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(runDailyReviewRequests).not.toHaveBeenCalled();
  });

  it("rejects everything when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(runDailyReviewRequests).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const pollMailbox = vi.fn();
vi.mock("@/lib/dc/import", () => ({ pollMailbox }));
const enabled = vi.fn(() => true);
vi.mock("@/lib/calendar/config", () => ({ calendarEnabled: () => enabled() }));

const { GET } = await import("@/app/api/cron/dc-quotes/route");
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/dc-quotes", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  pollMailbox.mockReset().mockResolvedValue({ seen: 1, results: [{ messageId: "<a@x>", outcome: "imported" }] });
  enabled.mockReturnValue(true);
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("GET /api/cron/dc-quotes", () => {
  it("polls and reports with the right secret", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ seen: 1, results: [{ messageId: "<a@x>", outcome: "imported" }] });
  });

  it.each([undefined, "Bearer wrong", "s3cret"])("rejects %s without polling", async (header) => {
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(pollMailbox).not.toHaveBeenCalled();
  });

  it("rejects everything when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(pollMailbox).not.toHaveBeenCalled();
  });

  it("skips without polling when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(pollMailbox).not.toHaveBeenCalled();
  });

  it("fails the run when any message failed, so Vercel shows it", async () => {
    pollMailbox.mockResolvedValue({ seen: 1, results: [{ messageId: "<a@x>", outcome: "failed" }] });
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
});

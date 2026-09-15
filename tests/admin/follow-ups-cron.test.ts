// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendFollowUpDigest = vi.fn();
vi.mock("@/lib/admin/follow-up-digest", () => ({ sendFollowUpDigest }));
const { GET } = await import("@/app/api/cron/follow-ups/route");
const call = (auth?: string) => GET(new Request("http://localhost/api/cron/follow-ups", auth ? { headers: { authorization: auth } } : {}));

beforeEach(() => {
  sendFollowUpDigest.mockReset().mockResolvedValue({ sent: 1 });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("follow-ups cron", () => {
  it("refuses without the secret, before doing anything", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(sendFollowUpDigest).not.toHaveBeenCalled();
  });
  it("sends the digest", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1 });
  });
  it("fails the run on an error so it isn't missed", async () => {
    sendFollowUpDigest.mockResolvedValue({ sent: 0, error: "down" });
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const sendTaskDigest = vi.fn();
vi.mock("@/lib/admin/task-emails", () => ({ sendTaskDigest }));
const { GET } = await import("@/app/api/cron/tasks/route");
const call = (auth?: string) => GET(new Request("http://localhost/api/cron/tasks", auth ? { headers: { authorization: auth } } : {}));

beforeEach(() => {
  sendTaskDigest.mockReset().mockResolvedValue({ sent: 1, failed: 0 });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("tasks cron", () => {
  it("refuses without the secret, before doing anything", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(sendTaskDigest).not.toHaveBeenCalled();
  });
  it("sends the digest", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, failed: 0 });
  });
  it("fails the run when any email failed, so it isn't missed", async () => {
    sendTaskDigest.mockResolvedValue({ sent: 1, failed: 1, error: "1 task digest email didn't send" });
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
  it("is scheduled at 7am Pacific (daylight time) in vercel.json", () => {
    const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(crons).toContainEqual({ path: "/api/cron/tasks", schedule: "0 14 * * *" });
  });
});

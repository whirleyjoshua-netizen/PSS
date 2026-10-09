// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const sendTaskDigest = vi.fn();
vi.mock("@/lib/admin/task-emails", () => ({ sendTaskDigest }));
const sweepTaskUploads = vi.fn();
vi.mock("@/lib/admin/task-file-sweep", () => ({ sweepTaskUploads }));
const { GET } = await import("@/app/api/cron/tasks/route");
const call = (auth?: string) => GET(new Request("http://localhost/api/cron/tasks", auth ? { headers: { authorization: auth } } : {}));

beforeEach(() => {
  sendTaskDigest.mockReset().mockResolvedValue({ sent: 1, failed: 0 });
  sweepTaskUploads.mockReset().mockResolvedValue({ removed: 0 });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("tasks cron", () => {
  it("refuses without the secret, before doing anything", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", undefined);
    expect(process.env.CRON_SECRET).toBeUndefined();
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(sendTaskDigest).not.toHaveBeenCalled();
    expect(sweepTaskUploads).not.toHaveBeenCalled();
  });
  it("sends the digest and sweeps abandoned task uploads", async () => {
    sweepTaskUploads.mockResolvedValue({ removed: 2 });
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, failed: 0, swept: { removed: 2 } });
  });
  it("fails the run when the sweep failed, after still sending the digest", async () => {
    sweepTaskUploads.mockResolvedValue({ removed: 0, error: "BlobServiceNotAvailable" });
    expect((await call("Bearer s3cret")).status).toBe(500);
    expect(sendTaskDigest).toHaveBeenCalled();
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

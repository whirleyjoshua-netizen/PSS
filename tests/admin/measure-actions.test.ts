import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const measurements = { addMeasurement: vi.fn(), updateMeasurement: vi.fn(), deleteMeasurement: vi.fn() };
vi.mock("@/lib/admin/measurements", () => measurements);
const deleteFile = vi.fn();
const getFile = vi.fn();
vi.mock("@/lib/admin/files", () => ({ deleteFile, getFile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/app/admin/jobs/measure-actions");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

const window = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  const fields = { room: "Kitchen", widthIn: "35", widthEighth: "5", heightIn: "48", heightEighth: "0", mount: "inside", ...overrides };
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

beforeEach(() => {
  Object.values(measurements).forEach((fn) => fn.mockReset());
  deleteFile.mockReset();
  getFile.mockReset();
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("saveMeasurement", () => {
  it("adds a new window as the signed-in owner", async () => {
    measurements.addMeasurement.mockResolvedValue(WIN);
    expect(await actions.saveMeasurement(LEAD, null, window())).toEqual({ ok: true });
    expect(measurements.addMeasurement).toHaveBeenCalledWith(
      LEAD, expect.objectContaining({ widthEighths: 285, mount: "inside" }), "owner@example.com",
    );
  });

  it("updates an existing window", async () => {
    measurements.updateMeasurement.mockResolvedValue(true);
    expect(await actions.saveMeasurement(LEAD, WIN, window())).toEqual({ ok: true });
    expect(measurements.updateMeasurement).toHaveBeenCalledWith(LEAD, WIN, expect.any(Object), "owner@example.com");
  });

  it("returns the error and the typed values when invalid", async () => {
    const state = await actions.saveMeasurement(LEAD, null, window({ mount: "" }));
    expect(state.error).toMatch(/mount/i);
    expect(state.values).toMatchObject({ room: "Kitchen", widthIn: "35" });
    expect(measurements.addMeasurement).not.toHaveBeenCalled();
  });

  it("reports a job or window that no longer exists", async () => {
    measurements.addMeasurement.mockResolvedValue(null);
    expect((await actions.saveMeasurement(LEAD, null, window())).error).toMatch(/no longer exists/);
  });
});

describe("without a session", () => {
  beforeEach(() => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it.each([
    ["saveMeasurement", () => actions.saveMeasurement(LEAD, null, window())],
    ["removeMeasurement", () => actions.removeMeasurement(LEAD, WIN)],
    ["removeFile", () => actions.removeFile(LEAD, WIN)],
  ])("%s touches nothing", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    Object.values(measurements).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(getFile).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe("deletes", () => {
  it("removes a window and a file as the signed-in owner", async () => {
    await actions.removeMeasurement(LEAD, WIN);
    expect(measurements.deleteMeasurement).toHaveBeenCalledWith(LEAD, WIN, "owner@example.com");
    getFile.mockResolvedValue({ id: WIN, leadId: LEAD });
    await actions.removeFile(LEAD, WIN);
    expect(deleteFile).toHaveBeenCalledWith(WIN, "owner@example.com");
  });

  it("does not delete a file that belongs to another job", async () => {
    getFile.mockResolvedValue({ id: WIN, leadId: "some-other-job" });
    await actions.removeFile(LEAD, WIN);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("does not delete a file that does not exist", async () => {
    getFile.mockResolvedValue(null);
    await actions.removeFile(LEAD, WIN);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

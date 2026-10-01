import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const measurements = { addMeasurement: vi.fn(), updateMeasurement: vi.fn(), deleteMeasurement: vi.fn(), setKeptOfficial: vi.fn() };
vi.mock("@/lib/admin/measurements", () => measurements);
const deleteFile = vi.fn();
const getFile = vi.fn();
vi.mock("@/lib/admin/files", () => ({ deleteFile, getFile }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

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
  revalidatePath.mockReset();
});

describe("saveMeasurement", () => {
  it("adds a new window as the signed-in owner", async () => {
    measurements.addMeasurement.mockResolvedValue({ id: WIN });
    expect(await actions.saveMeasurement(LEAD, null, "designer", window())).toEqual({ ok: true });
    expect(measurements.addMeasurement).toHaveBeenCalledWith(
      LEAD, "designer", expect.objectContaining({ widthEighths: 285, mount: "inside" }), "owner@example.com",
    );
  });

  it("passes the quantity typed on the form through to the save", async () => {
    measurements.addMeasurement.mockResolvedValue({ id: WIN });
    await actions.saveMeasurement(LEAD, null, "designer", window({ quantity: "10" }));
    expect(measurements.addMeasurement).toHaveBeenCalledWith(
      LEAD, "designer", expect.objectContaining({ quantity: 10 }), "owner@example.com",
    );
  });

  it("updates an existing window", async () => {
    measurements.updateMeasurement.mockResolvedValue(true);
    expect(await actions.saveMeasurement(LEAD, WIN, "designer", window())).toEqual({ ok: true });
    expect(measurements.updateMeasurement).toHaveBeenCalledWith(LEAD, WIN, expect.any(Object), "owner@example.com");
  });

  it("returns the error and the typed values when invalid", async () => {
    const state = await actions.saveMeasurement(LEAD, null, "designer", window({ mount: "" }));
    expect(state.error).toMatch(/mount/i);
    expect(state.values).toMatchObject({ room: "Kitchen", widthIn: "35" });
    expect(measurements.addMeasurement).not.toHaveBeenCalled();
  });

  it("reports a job or window that no longer exists", async () => {
    measurements.addMeasurement.mockResolvedValue({ refused: "missing" });
    expect((await actions.saveMeasurement(LEAD, null, "designer", window())).error).toMatch(/no longer exists/);
  });

  it("adds an official window as official", async () => {
    measurements.addMeasurement.mockResolvedValue({ id: WIN });
    expect(await actions.saveMeasurement(LEAD, null, "official", window())).toEqual({ ok: true });
    expect(measurements.addMeasurement).toHaveBeenCalledWith(LEAD, "official", expect.any(Object), "owner@example.com");
  });

  it("explains a kept job and keeps what was typed", async () => {
    measurements.addMeasurement.mockResolvedValue({ refused: "kept" });
    const state = await actions.saveMeasurement(LEAD, null, "official", window());
    expect(state.error).toBe(
      "This job is using the designer measure as its official measure. Untick “Keep as official measure” to take a separate one.",
    );
    expect(state.values).toMatchObject({ room: "Kitchen", widthIn: "35" });
  });

  it("refuses an unknown kind before saving anything", async () => {
    // A save would succeed, so only the kind check can stop it.
    measurements.addMeasurement.mockResolvedValue({ id: WIN });
    const state = await actions.saveMeasurement(LEAD, null, "final" as never, window());
    expect(state.error).toBe("Choose Designer measure or Official measure first.");
    expect(measurements.addMeasurement).not.toHaveBeenCalled();
    expect(measurements.updateMeasurement).not.toHaveBeenCalled();
  });
});

describe("setKeptOfficialAction", () => {
  it("keeps the designer measure as official as the signed-in owner", async () => {
    measurements.setKeptOfficial.mockResolvedValue("ok");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({});
    expect(measurements.setKeptOfficial).toHaveBeenCalledWith(LEAD, true, "owner@example.com");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${LEAD}`);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${LEAD}/measure`);
  });

  it("treats anything but true as untick", async () => {
    measurements.setKeptOfficial.mockResolvedValue("ok");
    await actions.setKeptOfficialAction(LEAD, "yes" as never);
    expect(measurements.setKeptOfficial).toHaveBeenCalledWith(LEAD, false, "owner@example.com");
  });

  it("explains why it cannot keep when an official measure exists", async () => {
    measurements.setKeptOfficial.mockResolvedValue("has-official");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({
      error: "An official measure is already recorded, so the designer measure can’t be kept as official.",
    });
  });

  it("says when the job is gone, and is quiet when nothing changed", async () => {
    measurements.setKeptOfficial.mockResolvedValue("missing");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({ error: "That job no longer exists." });
    measurements.setKeptOfficial.mockResolvedValue("unchanged");
    expect(await actions.setKeptOfficialAction(LEAD, true)).toEqual({});
  });

  it("requires an admin before anything else", async () => {
    requireAdmin.mockRejectedValue(new Error("redirect"));
    await expect(actions.setKeptOfficialAction(LEAD, true)).rejects.toThrow("redirect");
    expect(measurements.setKeptOfficial).not.toHaveBeenCalled();
  });
});

describe("without a session", () => {
  beforeEach(() => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it.each([
    ["saveMeasurement", () => actions.saveMeasurement(LEAD, null, "designer", window())],
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

describe("keeping the board panel fresh", () => {
  it("revalidates the board as well as the job page", async () => {
    measurements.addMeasurement.mockResolvedValue({ id: WIN });
    await actions.saveMeasurement(LEAD, null, "designer", window());
    await actions.removeMeasurement(LEAD, WIN);
    getFile.mockResolvedValue({ id: WIN, leadId: LEAD });
    await actions.removeFile(LEAD, WIN);
    expect(revalidatePath.mock.calls.filter(([path]) => path === "/admin")).toHaveLength(3);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${LEAD}`);
  });
});

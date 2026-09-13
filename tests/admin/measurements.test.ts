import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const deleteFile = vi.fn();
vi.mock("@/lib/admin/files", () => ({ deleteFile }));

const { measurementSchema } = await import("@/lib/admin/schema");
const m = await import("@/lib/admin/measurements");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const PHOTO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const form = {
  room: " Kitchen ", label: "Left of sink", widthIn: "35", widthEighth: "5", heightIn: "48", heightEighth: "0",
  depthIn: "", depthEighth: "0", mount: "inside", requirements: ["high_ladder"], notes: "", photoFileId: "",
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  deleteFile.mockReset().mockResolvedValue(true);
});

describe("measurementSchema", () => {
  it("turns the form into eighths and typed fields", () => {
    expect(measurementSchema.parse(form)).toEqual({
      room: "Kitchen", label: "Left of sink", widthEighths: 285, heightEighths: 384, depthEighths: null,
      mount: "inside", requirements: ["high_ladder"], notes: null, photoFileId: null,
    });
  });

  it("keeps an optional depth", () => {
    expect(measurementSchema.parse({ ...form, depthIn: "3", depthEighth: "4" }).depthEighths).toBe(28);
  });

  it("requires room, width, height, and mount", () => {
    expect(measurementSchema.safeParse({ ...form, room: " " }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, widthIn: "", widthEighth: "0" }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, heightIn: "0", heightEighth: "0" }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, mount: "" }).success).toBe(false);
  });

  it("refuses sizes over 600 inches and unknown requirements", () => {
    expect(measurementSchema.safeParse({ ...form, widthIn: "601" }).success).toBe(false);
    expect(measurementSchema.safeParse({ ...form, requirements: ["crane"] }).success).toBe(false);
  });

  it("names which dimension failed, with a clear reason", () => {
    const width = measurementSchema.safeParse({ ...form, widthIn: "601" });
    expect(width.success).toBe(false);
    if (!width.success) expect(width.error.issues[0].message).toContain("600");

    const depth = measurementSchema.safeParse({ ...form, depthIn: "2.5" });
    expect(depth.success).toBe(false);
    if (!depth.success) expect(depth.error.issues[0].message).toContain("Depth");

    const height = measurementSchema.safeParse({ ...form, heightIn: "-1" });
    expect(height.success).toBe(false);
    if (!height.success) expect(height.error.issues[0].message).toContain("Height");
  });

  it("accepts a photo id only when it is a uuid", () => {
    expect(measurementSchema.parse({ ...form, photoFileId: PHOTO }).photoFileId).toBe(PHOTO);
    expect(measurementSchema.safeParse({ ...form, photoFileId: "x" }).success).toBe(false);
  });
});

describe("measurements", () => {
  const input = measurementSchema.parse({ ...form, photoFileId: PHOTO });

  it("adds a window at the next position with its event, only using a photo from the same job", async () => {
    sql.mockResolvedValue([{ id: WIN }]);
    expect(await m.addMeasurement(LEAD, input, "owner@example.com")).toBe(WIN);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("coalesce(max(position)");
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("from job_files");
    expect(statement).toContain("kind = 'photo'");
  });

  it("orders windows by position, then created_at, then id", async () => {
    sql.mockResolvedValue([]);
    await m.listMeasurements(LEAD);
    expect(text(sql.mock.calls[0])).toContain("order by position, created_at, id");
  });

  it("returns null for a missing or non-uuid job", async () => {
    sql.mockResolvedValue([]);
    expect(await m.addMeasurement(LEAD, input, "o")).toBeNull();
    expect(await m.addMeasurement("nope", input, "o")).toBeNull();
  });

  it("updates a window of this job with its event", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: null, new_photo_id: PHOTO }]);
    expect(await m.updateMeasurement(LEAD, WIN, input, "o")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("update window_measurements");
    expect(text(sql.mock.calls[0])).toContain("kind = 'photo'");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([LEAD, WIN]));
  });

  const OLD_PHOTO = "5f4e3d2c-1b0a-4c9d-8e7f-6a5b4c3d2e1f";

  it("deletes the previous photo when a new one replaces it", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: OLD_PHOTO, new_photo_id: PHOTO }]);
    expect(await m.updateMeasurement(LEAD, WIN, input, "o")).toBe(true);
    expect(deleteFile).toHaveBeenCalledWith(OLD_PHOTO, "o");
  });

  it("does not delete the photo when it is unchanged", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: PHOTO, new_photo_id: PHOTO }]);
    expect(await m.updateMeasurement(LEAD, WIN, input, "o")).toBe(true);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("does not delete a previous photo when no new one is submitted", async () => {
    const noPhoto = measurementSchema.parse({ ...form, photoFileId: "" });
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: OLD_PHOTO, new_photo_id: OLD_PHOTO }]);
    expect(await m.updateMeasurement(LEAD, WIN, noPhoto, "o")).toBe(true);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("deletes a window and then its photo", async () => {
    sql.mockResolvedValue([{ photo_file_id: PHOTO }]);
    expect(await m.deleteMeasurement(LEAD, WIN, "o")).toBe(true);
    expect(deleteFile).toHaveBeenCalledWith(PHOTO, "o");
  });

  it("reports false for a window that is not on this job", async () => {
    sql.mockResolvedValue([]);
    expect(await m.deleteMeasurement(LEAD, WIN, "o")).toBe(false);
    expect(await m.getMeasurement(LEAD, "x")).toBeNull();
  });
});

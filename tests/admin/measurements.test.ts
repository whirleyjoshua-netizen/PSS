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
      mount: "inside", requirements: ["high_ladder"], notes: null, photoFileId: null, quantity: 1,
    });
  });

  it("takes a quantity of identical windows, 1 when left out or blank", () => {
    expect(measurementSchema.parse({ ...form, quantity: "10" }).quantity).toBe(10);
    expect(measurementSchema.parse({ ...form, quantity: "" }).quantity).toBe(1);
    expect(measurementSchema.parse({ ...form, quantity: undefined }).quantity).toBe(1);
  });

  it("accepts a quantity with spaces around it or leading zeros", () => {
    expect(measurementSchema.parse({ ...form, quantity: " 3 " }).quantity).toBe(3);
    expect(measurementSchema.parse({ ...form, quantity: "007" }).quantity).toBe(7);
  });

  it("refuses a quantity that is not a whole number from 1 to 99", () => {
    for (const quantity of ["0", "-2", "100", "2.5", "ten", "1e1", "+5", "0x10", "Infinity"]) {
      const parsed = measurementSchema.safeParse({ ...form, quantity });
      expect(parsed.success, quantity).toBe(false);
      if (!parsed.success) expect(parsed.error.issues[0].message).toBe("Quantity must be a whole number from 1 to 99");
    }
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
    sql.mockResolvedValue([{ id: WIN, found: true }]);
    expect(await m.addMeasurement(LEAD, "designer", input, "owner@example.com")).toEqual({ id: WIN });
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("coalesce(max(position)");
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("from job_files");
    expect(statement).toContain("kind = 'photo'");
  });

  it("saves the quantity with a new window and logs how many were added", async () => {
    sql.mockResolvedValue([{ id: WIN, found: true }]);
    await m.addMeasurement(LEAD, "designer", { ...input, quantity: 10 }, "o");
    const [strings, ...values] = sql.mock.calls[0];
    const statement = (strings as TemplateStringsArray).join("?");
    expect(statement).toMatch(/insert into window_measurements \([^)]*quantity\)/);
    expect(values).toContain(10);
    expect(values).toContain("Added 10 windows (designer): Kitchen, Left of sink");
  });

  it("logs a single window as before", async () => {
    sql.mockResolvedValue([{ id: WIN, found: true }]);
    await m.addMeasurement(LEAD, "designer", input, "o");
    expect(sql.mock.calls[0]).toContain("Added window (designer): Kitchen, Left of sink");
  });

  it("saves a changed quantity when a window is edited, and logs how many it now covers", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: null, new_photo_id: null }]);
    await m.updateMeasurement(LEAD, WIN, { ...input, quantity: 7 }, "o");
    expect(text(sql.mock.calls[0])).toMatch(/quantity = \?/);
    expect(sql.mock.calls[0]).toContain(7);
    expect(sql.mock.calls[0]).toContain("Edited 7 windows (");
  });

  it("logs the quantity change on an edit, reading the old quantity in the same statement", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: null, new_photo_id: null }]);
    await m.updateMeasurement(LEAD, WIN, { ...input, quantity: 7 }, "o");
    expect(sql).toHaveBeenCalledOnce();
    const statement = text(sql.mock.calls[0]);
    expect(statement).toMatch(/with previous as \(select [^)]*\bquantity\b[^)]*\bkind\b[^)]*from window_measurements/);
    expect(statement).toMatch(
      /case when previous\.quantity = \? then \? \|\| previous\.kind \|\| \?\s+else \? \|\| previous\.kind \|\| '\): ' \|\| previous\.quantity::text \|\| \? end/,
    );
    expect(sql.mock.calls[0]).toContain("Edited 7 windows (");
    expect(sql.mock.calls[0]).toContain("): Kitchen, Left of sink");
    expect(sql.mock.calls[0]).toContain("Edited Kitchen, Left of sink (");
    expect(sql.mock.calls[0]).toContain(" → 7 windows");
  });

  it("says one window, not windows, when an edit brings the quantity down to 1", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: null, new_photo_id: null }]);
    await m.updateMeasurement(LEAD, WIN, { ...input, quantity: 1 }, "o");
    expect(sql.mock.calls[0]).toContain(" → 1 window");
    expect(sql.mock.calls[0]).toContain("Edited window (");
  });

  it("logs how many windows a deleted line stood for, in the same statement", async () => {
    sql.mockResolvedValue([{ photo_file_id: null }]);
    expect(await m.deleteMeasurement(LEAD, WIN, "o")).toBe(true);
    expect(sql).toHaveBeenCalledOnce();
    const statement = text(sql.mock.calls[0]);
    expect(statement).toMatch(/returning [^)]*\bquantity\b[^)]*\bkind\b/);
    expect(statement).toContain(
      "case when quantity > 1 then 'Deleted ' || quantity::text || ' windows (' || kind || '): '"
        + " else 'Deleted window (' || kind || '): ' end || room || coalesce(', ' || label, '')",
    );
  });

  it("reads the quantity back from the row", async () => {
    sql.mockResolvedValue([{
      id: WIN, lead_id: LEAD, position: 1, room: "Kitchen", label: null, width_eighths: 285, height_eighths: 384,
      depth_eighths: null, mount: "inside", requirements: [], notes: null, photo_file_id: null, quantity: 10,
      kind: "official", measured_by: "o", created_at: "2026-09-29T00:00:00Z", updated_at: "2026-09-29T00:00:00Z",
    }]);
    expect((await m.getMeasurement(LEAD, WIN))?.quantity).toBe(10);
    expect((await m.getMeasurement(LEAD, WIN))?.kind).toBe("official");
  });

  it("orders windows by position, then created_at, then id", async () => {
    sql.mockResolvedValue([]);
    await m.listMeasurements(LEAD);
    expect(text(sql.mock.calls[0])).toContain("order by position, created_at, id");
  });

  it("refuses a missing or non-uuid job as missing", async () => {
    sql.mockResolvedValue([{ id: null, found: false }]);
    expect(await m.addMeasurement(LEAD, "designer", input, "o")).toEqual({ refused: "missing" });
    sql.mockClear();
    expect(await m.addMeasurement("nope", "designer", input, "o")).toEqual({ refused: "missing" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("saves the window's kind and refuses an official window on a kept job, in the same statement", async () => {
    sql.mockResolvedValue([{ id: WIN, found: true }]);
    await m.addMeasurement(LEAD, "official", input, "o");
    expect(sql).toHaveBeenCalledOnce();
    const [strings, ...values] = sql.mock.calls[0];
    const statement = (strings as TemplateStringsArray).join("?");
    expect(statement).toMatch(/insert into window_measurements \(lead_id, kind,/);
    expect(statement).toContain("designer_kept_official_at is null");
    // The insert reads from the guarded CTE, so a kept job really refuses the official window.
    expect(statement).toMatch(/insert into window_measurements[\s\S]*?select allowed\.id[\s\S]*?from allowed/);
    expect(values).toContain("official");
    expect(values).toContain("Added window (official): Kitchen, Left of sink");
  });

  it("says kept when the job exists but the official window was refused", async () => {
    sql.mockResolvedValue([{ id: null, found: true }]);
    expect(await m.addMeasurement(LEAD, "official", input, "o")).toEqual({ refused: "kept" });
  });

  it("never changes a window's kind on edit", async () => {
    sql.mockResolvedValue([{ id: WIN, previous_photo_id: null, new_photo_id: null }]);
    await m.updateMeasurement(LEAD, WIN, input, "o");
    // Only the update's set list: the photo CTE legitimately reads job_files' kind = 'photo'.
    const setList = text(sql.mock.calls[0]).match(/update window_measurements set([\s\S]*?)\bwhere\b/)?.[1];
    expect(setList).toBeDefined();
    expect(setList).not.toMatch(/\bkind\s*=/);
  });

  it("reads both lists and the kept record for a job", async () => {
    const row = {
      id: WIN, lead_id: LEAD, position: 1, room: "Kitchen", label: null, width_eighths: 285, height_eighths: 384,
      depth_eighths: null, mount: "inside", requirements: [], notes: null, photo_file_id: null, quantity: 1,
      kind: "designer", measured_by: "o", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    };
    sql.mockResolvedValueOnce([row]).mockResolvedValueOnce([
      { designer_kept_official_at: "2026-10-01T15:00:00Z", designer_kept_official_by: "owner@example.com" },
    ]);
    const set = await m.getMeasureSet(LEAD);
    expect(set.windows.map((w) => w.kind)).toEqual(["designer"]);
    expect(set.kept).toEqual({ at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" });
  });

  it("reads no kept record when the job has none", async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ designer_kept_official_at: null, designer_kept_official_by: null }]);
    expect((await m.getMeasureSet(LEAD)).kept).toBeNull();
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

describe("setKeptOfficial", () => {
  it("ticks only when no official window exists, with its event, in one statement", async () => {
    sql.mockResolvedValue([{ changed: true, found: true, was_kept: false, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, true, "owner@example.com")).toBe("ok");
    expect(sql).toHaveBeenCalledOnce();
    const [strings, ...values] = sql.mock.calls[0];
    const statement = (strings as TemplateStringsArray).join("?");
    expect(statement).toContain("update leads set designer_kept_official_at");
    expect(statement).toContain("kind = 'official'");
    // The refusal lives in the update's own where clause, not just in a CTE nobody consults.
    const where = statement.match(/update leads set[\s\S]*?\bwhere\b([\s\S]*?)\breturning\b/)?.[1];
    expect(where).toMatch(/not \?::boolean or not exists \(select 1 from official\)/);
    // Asking for what the job already says updates nothing (no new at/by, no second event).
    expect(where).toContain("and (designer_kept_official_at is not null) <> ?::boolean");
    expect(statement).toContain("insert into job_events");
    expect(values).toContain("Designer measure kept as official");
  });

  it("logs the untick wording", async () => {
    sql.mockResolvedValue([{ changed: true, found: true, was_kept: true, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, false, "o")).toBe("ok");
    expect(sql.mock.calls[0]).toContain("Designer measure no longer kept as official");
  });

  it("says unchanged when the box already says so (no second event)", async () => {
    sql.mockResolvedValue([{ changed: false, found: true, was_kept: true, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, true, "o")).toBe("unchanged");
  });

  it("refuses to tick when an official measure is recorded", async () => {
    sql.mockResolvedValue([{ changed: false, found: true, was_kept: false, has_official: true }]);
    expect(await m.setKeptOfficial(LEAD, true, "o")).toBe("has-official");
  });

  it("says missing for an unknown or non-uuid job", async () => {
    sql.mockResolvedValue([{ changed: false, found: false, was_kept: null, has_official: false }]);
    expect(await m.setKeptOfficial(LEAD, true, "o")).toBe("missing");
    sql.mockClear();
    expect(await m.setKeptOfficial("nope", true, "o")).toBe("missing");
    expect(sql).not.toHaveBeenCalled();
  });
});

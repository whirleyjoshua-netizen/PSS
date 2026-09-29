import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The db is mocked throughout: migration 019 has not been applied to any database and
 * .env.local holds production credentials. It stands in here as a tripwire rather than a
 * fixture — a service request must reach `leads` only through createJob(), so any direct
 * statement from this module at all is a failure, whatever it says.
 */
const query = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/db", () => ({ db: () => query }));

const createJob = vi.fn(async (..._args: unknown[]) => NEW_JOB);
const getJob = vi.fn(async (..._args: unknown[]) => ({ id: NEW_JOB, projectNo: 1051 }) as unknown);
vi.mock("@/lib/admin/jobs", () => ({
  createJob,
  getJob,
  isUuid: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
}));

const createFile = vi.fn(async () => ({ id: "file-1" }));
vi.mock("@/lib/admin/files", () => ({ createFile }));

const listMeasurements = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/admin/measurements", () => ({
  listMeasurements,
  describe: (w: { room: string; label: string | null }) => (w.label ? `${w.room}, ${w.label}` : w.room),
}));

const notifyOwnersOfServiceRequest = vi.fn(async (_input: unknown) => {});
vi.mock("@/lib/portal/send-service-email", () => ({ notifyOwnersOfServiceRequest }));

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));

// after() runs its callback inline here, so the email can be asserted on.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const { requestService } = await import("@/lib/portal/service-request");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const MISSING = "8c1e3f2b-4a53-4c52-9a1c-2d3e4f5a6b7c";
const WINDOW = "1b2c3d4e-5f60-4a71-8b92-0c1d2e3f4a5b";
const STALE = "2c3d4e5f-6071-4b82-9ca3-1d2e3f4a5b6c";
const NEW_JOB = "5e4f3a2b-1c0d-4e9f-8a7b-6c5d4e3f2a1b";
const EMAIL = "maria@example.com";

/** A parent job as visibleJobs() returns it: the fields a service job copies. */
const parent = (over: Record<string, unknown> = {}) => ({
  id: MINE,
  name: "Maria Lopez",
  phone: "7025550143",
  email: EMAIL,
  address: "12 Palm Way",
  city: "Henderson",
  status: "installed",
  projectNo: 1002,
  ...over,
});

const form = (over: Record<string, unknown> = {}) => ({
  windowText: "The big window in the den",
  issue: "wont-move",
  ...over,
});

const photo = (bytes = 1024, type = "image/jpeg", name = "blind.jpg") => {
  const file = new File([new Uint8Array(Math.min(bytes, 1024))], name, { type });
  // Defined rather than allocated: an 11 MB buffer in every run costs more than it proves.
  Object.defineProperty(file, "size", { value: bytes });
  return file;
};

const notesOf = () => String((createJob.mock.calls[0][0] as { notes?: string } | undefined)?.notes ?? "");

beforeEach(() => {
  query.mockClear();
  createJob.mockReset().mockResolvedValue(NEW_JOB);
  getJob.mockReset().mockResolvedValue({ id: NEW_JOB, projectNo: 1051 });
  createFile.mockReset().mockResolvedValue({ id: "file-1" });
  listMeasurements.mockReset().mockResolvedValue([]);
  notifyOwnersOfServiceRequest.mockReset().mockResolvedValue(undefined);
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [parent()] });
});

/**
 * The load-bearing rule: a job the caller does not own answers exactly as one that does not
 * exist, and nothing at all is created. The return value alone would not prove it — only
 * "createJob was never called" distinguishes refused-before-acting from tried-and-failed.
 */
describe("ownership", () => {
  it("refuses a job the customer does not own, and creates nothing", async () => {
    await expect(requestService(THEIRS, form())).resolves.toEqual({ status: "not-found" });
    expect(createJob).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
    expect(notifyOwnersOfServiceRequest).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("answers a job that does not exist the same way, telling the caller nothing apart", async () => {
    const missing = await requestService(MISSING, form());
    expect(missing).toEqual(await requestService(THEIRS, form()));
    expect(createJob).not.toHaveBeenCalled();
  });

  it("re-derives the jobs from the session rather than trusting the id", async () => {
    await requestService(MINE, form());
    expect(requireCustomer).toHaveBeenCalledTimes(1);
  });
});

/** Ownership first, then status: a job still being quoted has no installed work to service. */
describe("status", () => {
  it.each(["quoted", "sold", "ordered"] as const)("refuses a job that is only %s", async (status) => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [parent({ status })] });
    await expect(requestService(MINE, form())).resolves.toEqual({ status: "not-found" });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("accepts a completed job, which is finished work too", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [parent({ status: "completed" })] });
    await expect(requestService(MINE, form())).resolves.toMatchObject({ status: "created" });
  });
});

describe("what it creates", () => {
  it("creates the new job through createJob, never a direct insert", async () => {
    await expect(requestService(MINE, form())).resolves.toMatchObject({ status: "created", jobId: NEW_JOB });
    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "service",
        stage: "new",
        name: "Maria Lopez",
        phone: "7025550143",
        email: EMAIL,
        address: "12 Palm Way",
        city: "Henderson",
      }),
      expect.any(String),
      expect.objectContaining({ parentJobId: MINE, eventBody: "Service requested by the customer" }),
    );
    // Geocoding and the opening event hang off createJob; a direct statement would skip both.
    expect(query).not.toHaveBeenCalled();
  });

  /** Migration 019 widened the kind constraint for this row; nothing else writes it. */
  it("logs the opening event as a service request, not a plain stage change", async () => {
    await requestService(MINE, form());
    expect(createJob.mock.calls[0][2]).toMatchObject({ eventKind: "service" });
  });

  it("writes the answers into the new job's note", async () => {
    await requestService(MINE, form({ details: "It started after the storm." }));
    const notes = notesOf();
    expect(notes).toContain("Will not go up or down");
    expect(notes).toContain("The big window in the den");
    expect(notes).toContain("It started after the storm.");
  });

  it("names the window the owners measured, through describe()", async () => {
    listMeasurements.mockResolvedValue([{ id: WINDOW, room: "Dining Room", label: "left window" }]);
    await requestService(MINE, form({ windowId: WINDOW, windowText: undefined }));
    expect(listMeasurements).toHaveBeenCalledWith(MINE);
    const notes = notesOf();
    expect(notes).toContain("Dining Room, left window");
    // The id is recorded beside the text so the owners need not interpret prose.
    expect(notes).toContain(WINDOW);
  });

  it("records that the window is one of several identical ones", async () => {
    listMeasurements.mockResolvedValue([{ id: WINDOW, room: "Den", label: null, quantity: 10 }]);
    await requestService(MINE, form({ windowId: WINDOW, windowText: undefined }));
    expect(notesOf()).toContain(`Window: Den (one of 10) (window id ${WINDOW})`);
  });

  it("falls back to the customer's own words for a window that was never measured", async () => {
    await requestService(MINE, form({ windowText: "Upstairs landing" }));
    expect(notesOf()).toContain("Upstairs landing");
  });

  /** The number the customer quotes when they call about the repair. */
  it("returns the new job's project number for the confirmation", async () => {
    await expect(requestService(MINE, form())).resolves.toMatchObject({ projectNo: "PSS-1051" });
    expect(getJob).toHaveBeenCalledWith(NEW_JOB);
  });

  it("still reports the request when the project number cannot be read", async () => {
    getJob.mockRejectedValue(new Error("db blipped"));
    await expect(requestService(MINE, form())).resolves.toMatchObject({ status: "created", projectNo: null });
  });
});

/**
 * A stale page or a tampered id. Recording "Not specified" would send the owners out knowing
 * no more than we do, so the customer is asked again — keeping everything else they typed.
 */
describe("a window that is not this job's", () => {
  it("asks again when nothing was typed instead", async () => {
    await expect(
      requestService(MINE, form({ windowId: STALE, windowText: undefined })),
    ).resolves.toEqual({ status: "unknown-window" });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("uses the typed words when there are some, rather than refusing", async () => {
    await requestService(MINE, form({ windowId: STALE, windowText: "Upstairs landing" }));
    expect(notesOf()).toContain("Upstairs landing");
    expect(notesOf()).not.toContain(STALE);
  });
});

describe("the photo", () => {
  it("attaches it to the NEW job, not the parent", async () => {
    await requestService(MINE, { ...form(), photo: photo() });
    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: NEW_JOB, kind: "photo", actor: EMAIL }),
    );
  });

  /**
   * An iPhone photo often arrives with an empty or unrecognised type. Rejecting a genuine
   * photo of the broken blind for its container would be the wrong answer every time.
   */
  it("accepts a phone photo whose type the browser did not name", async () => {
    await requestService(MINE, { ...form(), photo: photo(2048, "", "IMG_0042.HEIC") });
    expect(createFile).toHaveBeenCalled();
  });

  it("accepts a HEIC that does name itself", async () => {
    await requestService(MINE, { ...form(), photo: photo(2048, "image/heic", "IMG_0042.heic") });
    expect(createFile).toHaveBeenCalled();
  });

  it("does not attach a file that is not an image at all", async () => {
    await requestService(MINE, { ...form(), photo: photo(2048, "application/pdf", "quote.pdf") });
    expect(createFile).not.toHaveBeenCalled();
    expect(notifyOwnersOfServiceRequest.mock.calls[0][0]).toMatchObject({ photoFailed: true });
  });

  /** A repair request that vanished because of an image will simply not be made again. */
  it("still creates the job when the photo fails", async () => {
    createFile.mockRejectedValue(new Error("blob down"));
    await expect(requestService(MINE, { ...form(), photo: photo() })).resolves.toMatchObject({
      status: "created",
    });
    expect(createJob).toHaveBeenCalled();
    expect(notifyOwnersOfServiceRequest).toHaveBeenCalled();
  });

  it("tells the owners a photo was sent but did not arrive", async () => {
    createFile.mockRejectedValue(new Error("blob down"));
    await requestService(MINE, { ...form(), photo: photo() });
    expect(notifyOwnersOfServiceRequest.mock.calls[0][0]).toMatchObject({ photoFailed: true });
  });

  it("skips an oversized image rather than losing the request", async () => {
    await expect(
      requestService(MINE, { ...form(), photo: photo(11 * 1024 * 1024) }),
    ).resolves.toMatchObject({ status: "created" });
    expect(createFile).not.toHaveBeenCalled();
    expect(notifyOwnersOfServiceRequest.mock.calls[0][0]).toMatchObject({ photoFailed: true });
  });

  it("ignores an empty file input, which is what a no-JS post sends when nothing was chosen", async () => {
    await requestService(MINE, { ...form(), photo: photo(0) });
    expect(createFile).not.toHaveBeenCalled();
    expect(notifyOwnersOfServiceRequest.mock.calls[0][0]).toMatchObject({ photoFailed: false });
  });
});

describe("the owners' email", () => {
  it("tells them what broke, which window, the parent project and the new job", async () => {
    await requestService(MINE, form({ details: "Cord is jammed." }));
    expect(notifyOwnersOfServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: NEW_JOB,
        parent: expect.objectContaining({ id: MINE, name: "Maria Lopez", projectNo: 1002 }),
        issue: "wont-move",
        window: "The big window in the den",
        details: "Cord is jammed.",
        replyTo: EMAIL,
      }),
    );
  });

  it("keeps the request when the email fails", async () => {
    notifyOwnersOfServiceRequest.mockRejectedValue(new Error("Resend is down"));
    await expect(requestService(MINE, form())).resolves.toMatchObject({ status: "created" });
    expect(createJob).toHaveBeenCalled();
  });
});

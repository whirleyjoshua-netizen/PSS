import { describe, it, expect, vi, beforeEach } from "vitest";

/** The form's wrapper around requestService: validation, and the guard in front of it. */
const CREATED = { status: "created", jobId: "5e4f3a2b-1c0d-4e9f-8a7b-6c5d4e3f2a1b", projectNo: "PSS-1051" };
const requestService = vi.fn(async (..._args: unknown[]) => CREATED as unknown);
vi.mock("@/lib/portal/service-request", () => ({ requestService }));

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer, destroyCustomerSession: vi.fn() }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/portal/messages", () => ({ sendMessage: vi.fn() }));
vi.mock("@/lib/portal/send-message-email", () => ({ notifyOwnersOfMessage: vi.fn() }));

const { requestServiceAction } = await import("@/app/(site)/project/actions");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const EMAIL = "maria@example.com";
const job = (over: Record<string, unknown> = {}) => ({ id: MINE, status: "installed", ...over });

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    jobId: MINE,
    windowText: "The big window in the den",
    issue: "wont-move",
    ...fields,
  })) {
    data.set(key, value);
  }
  return data;
};

const submit = (data: FormData) => requestServiceAction({ status: "idle" }, data);

beforeEach(() => {
  requestService.mockReset().mockResolvedValue(CREATED);
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job()] });
  revalidatePath.mockReset();
  redirect.mockClear();
});

describe("requestServiceAction", () => {
  it("refuses a job the customer does not own before parsing anything", async () => {
    await expect(submit(form({ jobId: THEIRS }))).resolves.toEqual({ status: "not-found" });
    expect(requestService).not.toHaveBeenCalled();
  });

  it("refuses a job that is not installed the same way", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job({ status: "quoted" })] });
    await expect(submit(form())).resolves.toEqual({ status: "not-found" });
    expect(requestService).not.toHaveBeenCalled();
  });

  it("asks for a window when neither the picker nor the box was answered", async () => {
    const state = await submit(form({ windowText: "" }));
    expect(state.status).toBe("invalid");
    expect(state.errors?.windowText).toBe("Tell us which window");
    expect(requestService).not.toHaveBeenCalled();
  });

  it("asks what is happening when nothing was chosen", async () => {
    const state = await submit(form({ issue: "" }));
    expect(state.status).toBe("invalid");
    expect(state.errors?.issue).toBe("Tell us what is happening");
  });

  it("hands back everything they typed so a no-JS post loses nothing", async () => {
    const state = await submit(form({ issue: "", details: "Cord is jammed." }));
    expect(state.values).toMatchObject({
      windowText: "The big window in the den",
      details: "Cord is jammed.",
    });
  });

  it("passes the validated answers through and lands them back on their project", async () => {
    await expect(submit(form({ details: "Cord is jammed." }))).rejects.toThrow("NEXT_REDIRECT");
    expect(requestService).toHaveBeenCalledWith(
      MINE,
      expect.objectContaining({ issue: "wont-move", windowText: "The big window in the den", details: "Cord is jammed." }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/project");
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  /** The reference they quote when they call about the repair travels back on the URL. */
  it("carries the new project number into the confirmation", async () => {
    await expect(submit(form())).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?requested=PSS-1051`);
  });

  it("still lands them back when the number could not be read", async () => {
    requestService.mockResolvedValue({ ...CREATED, projectNo: null });
    await expect(submit(form())).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}`);
  });

  /** A stale picker: everything else they typed comes back with the question. */
  it("asks again for a window that is not one of this job's", async () => {
    requestService.mockResolvedValue({ status: "unknown-window" });
    const state = await submit(form({ details: "Cord is jammed." }));
    expect(state.status).toBe("invalid");
    expect(state.errors?.windowText).toBe("Tell us which window");
    expect(state.values).toMatchObject({ details: "Cord is jammed." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports a refusal from requestService rather than redirecting", async () => {
    requestService.mockResolvedValue({ status: "not-found" });
    await expect(submit(form())).resolves.toEqual({ status: "not-found" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

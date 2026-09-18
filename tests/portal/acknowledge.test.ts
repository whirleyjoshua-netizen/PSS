import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The db is mocked as a SAFETY NET, not as proof: .env.local holds production credentials, so
 * no test here may reach a database.
 *
 * It is deliberately not asserted on. Every writer on these paths — setStage, createJob,
 * setReviewOptOut — is itself mocked below, so no code here can reach db() whatever a guard
 * does, and `expect(query).not.toHaveBeenCalled()` would pass just as happily with every guard
 * deleted. Spec §8 wants "the absence of any database statement" proven, so the assertions
 * below are made against those mocked writers instead: they are what actually stands between
 * the action and the database, and they can fail.
 */
const query = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/db", () => ({ db: () => query }));

/**
 * setStage is mocked rather than driven through the db, so the assertion can be about the
 * ARGUMENTS. The options are a named object: `setStage(id, to, actor, { body })`. Passed
 * positionally the body is silently discarded and the timeline records a bare status change
 * with no sentence, which is exactly the failure that would never show up in a smoke test.
 * setStage's own SQL is proven in tests/portal/approve.test.ts against the real statement.
 */
const setStage = vi.fn(async (..._args: unknown[]) => true);
const createJob = vi.fn(async (..._args: unknown[]) => NEW_JOB);
const getJob = vi.fn(async (..._args: unknown[]) => ({ id: NEW_JOB, projectNo: 1051 }) as unknown);
vi.mock("@/lib/admin/jobs", () => ({
  setStage,
  createJob,
  getJob,
  isUuid: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
}));

const setReviewOptOut = vi.fn(async () => true);
vi.mock("@/lib/reviews/db", () => ({ setReviewOptOut }));

const order: string[] = [];
const notifyOwnersOfAcknowledgement = vi.fn(async () => {
  order.push("email");
});
vi.mock("@/lib/portal/send-acknowledgement-email", () => ({ notifyOwnersOfAcknowledgement }));

const notifyOwnersOfServiceRequest = vi.fn(async (_input: unknown) => {});
vi.mock("@/lib/portal/send-service-email", () => ({ notifyOwnersOfServiceRequest }));

const createFile = vi.fn(async () => ({ id: "file-1" }));
const listSharedDocuments = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/admin/files", () => ({ createFile, listSharedDocuments, listBlobPathnames: vi.fn(async () => []) }));

const listMeasurements = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/admin/measurements", () => ({
  listMeasurements,
  describe: (w: { room: string; label: string | null }) => (w.label ? `${w.room}, ${w.label}` : w.room),
}));

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer, destroyCustomerSession: vi.fn() }));

vi.mock("@/lib/portal/messages", () => ({ sendMessage: vi.fn(), listMessages: vi.fn() }));
vi.mock("@/lib/portal/send-message-email", () => ({ notifyOwnersOfMessage: vi.fn() }));
vi.mock("@/lib/portal/send-approval-email", () => ({ notifyOwnersOfApproval: vi.fn() }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
// after() runs its callback inline here so the email and its ordering can be asserted on.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
// redirect() works by throwing, so the thrown path is what a test reads the URL off.
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const { requestService } = await import("@/lib/portal/service-request");
const {
  acknowledgeInstallAction,
  acknowledgeInstallFormAction,
  acknowledgeProblemAction,
  requestServiceAction,
} = await import("@/app/(site)/project/actions");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const MISSING = "8c1e3f2b-4a53-4c52-9a1c-2d3e4f5a6b7c";
const NEW_JOB = "5e4f3a2b-1c0d-4e9f-8a7b-6c5d4e3f2a1b";
const EMAIL = "maria@example.com";

/** The sentence an owner reads back off the timeline in six months (spec §5). */
const BODY = "Confirmed the installation from their project page";

const job = (over: Record<string, unknown> = {}) => ({
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

const input = (over: Record<string, unknown> = {}) => ({
  windowText: "The big window in the den",
  issue: "wont-move",
  ...over,
});

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

beforeEach(() => {
  order.length = 0;
  query.mockClear();
  setStage.mockReset().mockImplementation(async () => {
    order.push("stage");
    return true;
  });
  createJob.mockReset().mockResolvedValue(NEW_JOB);
  getJob.mockReset().mockResolvedValue({ id: NEW_JOB, projectNo: 1051 });
  setReviewOptOut.mockReset().mockResolvedValue(true);
  notifyOwnersOfAcknowledgement.mockReset().mockImplementation(async () => {
    order.push("email");
  });
  notifyOwnersOfServiceRequest.mockReset().mockResolvedValue(undefined);
  createFile.mockReset().mockResolvedValue({ id: "file-1" });
  listMeasurements.mockReset().mockResolvedValue([]);
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job()] });
  revalidatePath.mockReset();
  redirect.mockClear();
});

/**
 * "Yes, everything looks great". Spec §5: ownership, then the status, then one transition.
 */
describe("acknowledgeInstallAction", () => {
  it("completes the job with the customer as actor", async () => {
    await expect(acknowledgeInstallAction(MINE)).resolves.toBe("acknowledged");
    // The options are a NAMED object. Positionally the body is discarded in silence and the
    // owners get a status change with no sentence against it.
    expect(setStage).toHaveBeenCalledWith(MINE, "completed", EMAIL, { body: BODY });
  });

  it("records it as the customer's own act, not an owner's click", async () => {
    await acknowledgeInstallAction(MINE);
    const [, , actor] = setStage.mock.calls[0] as unknown[];
    expect(actor).toBe(EMAIL);
  });

  /** Spec §6: the target status is a literal here; it never arrives from the browser. */
  it("refuses unless the status is installed", async () => {
    for (const status of ["quoted", "sold", "ordered"]) {
      requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job({ status })] });
      await expect(acknowledgeInstallAction(MINE)).resolves.toBe("wrong-status");
      // Nothing was written and nobody was told: the writers are the real tripwire.
      expect(setStage).not.toHaveBeenCalled();
      expect(notifyOwnersOfAcknowledgement).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  });

  /**
   * An already-completed job is a question already answered, so it gets the same success the
   * first tap did — and nothing happens twice. This shortcut sits AFTER the ownership refusal,
   * never before it, or a stranger's id would find out whether a completed job exists.
   */
  it("answers an already-completed job with the same success, writing nothing", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job({ status: "completed" })] });
    await expect(acknowledgeInstallAction(MINE)).resolves.toBe("acknowledged");
    expect(setStage).not.toHaveBeenCalled();
    expect(notifyOwnersOfAcknowledgement).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  /** The load-bearing rule (spec §6). */
  it("refuses a job the customer does not own and writes nothing", async () => {
    await expect(acknowledgeInstallAction(THEIRS)).resolves.toBe("not-found");

    // The assertion with teeth. The return value alone would still pass with the ownership
    // check deleted: the unguarded path would reach setStage, move nothing for a job that is
    // not there and answer the same way. Only proving nothing ran at all separates "refused
    // before touching anything" from "tried and happened to fail".
    // Every writer that stands between this action and the database, and every side effect
    // beyond it. Each of these can fail — the db handle itself cannot, since it is unreachable
    // once these are mocked, which is why it is not asserted on here.
    expect(setStage).not.toHaveBeenCalled();
    expect(setReviewOptOut).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(notifyOwnersOfAcknowledgement).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers a job that does not exist the same way, telling the caller nothing apart", async () => {
    expect(await acknowledgeInstallAction(MISSING)).toBe(await acknowledgeInstallAction(THEIRS));
    expect(setStage).not.toHaveBeenCalled();
  });

  /**
   * A call count alone would pass against an implementation that trusted the submitted id and
   * called requireCustomer() only to learn the caller's address. What must be true is stronger:
   * the session is re-read on EVERY call, and what it says about the job decides the answer.
   *
   * So the same id is asked for twice while only the session changes underneath it. An
   * implementation that trusted the id, or cached the first answer, would complete it twice.
   */
  it("re-derives the job from the session on every call, never trusting the id", async () => {
    await expect(acknowledgeInstallAction(MINE)).resolves.toBe("acknowledged");
    expect(setStage).toHaveBeenCalledTimes(1);

    setStage.mockClear();
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job({ status: "ordered" })] });

    // Nothing about the id changed — only what the session says about it.
    await expect(acknowledgeInstallAction(MINE)).resolves.toBe("wrong-status");
    expect(setStage).not.toHaveBeenCalled();
    expect(requireCustomer).toHaveBeenCalledTimes(2);
  });

  it("moves the job before sending any email", async () => {
    await acknowledgeInstallAction(MINE);
    expect(order).toEqual(["stage", "email"]);
  });

  /** Spec §7: a failed email must not undo the move. */
  it("keeps the acknowledgement even when the notification email fails", async () => {
    notifyOwnersOfAcknowledgement.mockRejectedValueOnce(new Error("Resend is down"));
    await expect(acknowledgeInstallAction(MINE)).resolves.toBe("acknowledged");
    expect(setStage).toHaveBeenCalledTimes(1);
  });

  it("tells the owners who confirmed it", async () => {
    await acknowledgeInstallAction(MINE);
    expect(notifyOwnersOfAcknowledgement).toHaveBeenCalledWith(
      expect.objectContaining({ id: MINE }),
      EMAIL,
    );
  });

  it("revalidates both the single-job page and the job's own path", async () => {
    await acknowledgeInstallAction(MINE);
    expect(revalidatePath).toHaveBeenCalledWith("/project");
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  it("sends no email and revalidates nothing when the move did not happen", async () => {
    setStage.mockResolvedValue(false);
    await expect(acknowledgeInstallAction(MINE)).resolves.not.toBe("acknowledged");
    expect(notifyOwnersOfAcknowledgement).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  /** "not-found" must mean not found: a job that declined the move plainly exists. */
  it("never answers not-found for a job that exists", async () => {
    setStage.mockResolvedValue(false);
    // The actual answer, not merely "something other than not-found": a declined move can only
    // mean the job was not in the status this transition starts from.
    await expect(acknowledgeInstallAction(MINE)).resolves.toBe("wrong-status");
  });
});

/**
 * The form's wrapper. A plain post must still say what happened, so the outcome rides back on
 * the URL exactly as `?approved=` and `?requested=` already do on this page.
 */
describe("acknowledgeInstallFormAction", () => {
  const post = (jobId: string) => {
    const data = new FormData();
    data.set("jobId", jobId);
    return acknowledgeInstallFormAction(data);
  };

  it("lands the customer back on their project saying it was confirmed", async () => {
    await expect(post(MINE)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?acknowledged=1`);
  });

  it("says so on the URL when the acknowledgement was refused", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job({ status: "ordered" })] });
    await expect(post(MINE)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?acknowledged=no`);
  });

  it("redirects on every outcome, never returning silently", async () => {
    await expect(post(THEIRS)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});

/**
 * "Something is not right". The job stays installed and the review email is muted — spec §5.
 *
 * Provenance is the server's, decided by which action the route handed the form, never by a
 * submitted field. It is a third argument to requestService for exactly that reason.
 */
describe("a service request from an acknowledgement", () => {
  it("mutes the review email", async () => {
    await requestService(MINE, input(), { fromAcknowledgement: true });
    expect(setReviewOptOut).toHaveBeenCalledWith(MINE, true, EMAIL);
  });

  /** Muting the PARENT job. The new service job has no review request to suppress. */
  it("mutes the job they are complaining about, not the service job it created", async () => {
    await requestService(MINE, input(), { fromAcknowledgement: true });
    expect(setReviewOptOut).not.toHaveBeenCalledWith(NEW_JOB, true, EMAIL);
  });

  it("leaves the job at installed", async () => {
    await requestService(MINE, input(), { fromAcknowledgement: true });
    // Spec §5: the job stays installed until the owners resolve it. Nothing moves it.
    expect(setStage).not.toHaveBeenCalled();
  });

  it("still files the service request", async () => {
    await expect(requestService(MINE, input(), { fromAcknowledgement: true })).resolves.toMatchObject({
      status: "created",
    });
    expect(createJob).toHaveBeenCalledTimes(1);
  });

  /** So the owners know this is a customer saying the install is wrong, not a later fault. */
  it("says so in the owners' email", async () => {
    await requestService(MINE, input(), { fromAcknowledgement: true });
    expect(notifyOwnersOfServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ fromAcknowledgement: true }),
    );
  });

  it("an ordinary service request does NOT mute it", async () => {
    await requestService(MINE, input());
    expect(setReviewOptOut).not.toHaveBeenCalled();
    expect(notifyOwnersOfServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ fromAcknowledgement: false }),
    );
  });

  it("mutes nothing for a job the customer does not own", async () => {
    await expect(requestService(THEIRS, input(), { fromAcknowledgement: true })).resolves.toEqual({
      status: "not-found",
    });
    expect(setReviewOptOut).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  /** A failed mute must not cost the repair request: the job is already on the board. */
  it("keeps the request even when the mute fails", async () => {
    setReviewOptOut.mockRejectedValueOnce(new Error("db is down"));
    await expect(requestService(MINE, input(), { fromAcknowledgement: true })).resolves.toMatchObject({
      status: "created",
    });
  });
});

/**
 * The security boundary the brief names. `fromAcknowledgement` is NOT part of
 * serviceRequestSchema, so a crafted post cannot assert its own provenance and silence the
 * owners' review request. Only the action the acknowledgement route hands the form can.
 */
describe("provenance is the server's, never the form's", () => {
  it("cannot be muted by a crafted form post", async () => {
    await expect(
      requestServiceAction({ status: "idle" }, form({ fromAcknowledgement: "true" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(setReviewOptOut).not.toHaveBeenCalled();
  });

  it("is not muted by an ordinary post either", async () => {
    await expect(requestServiceAction({ status: "idle" }, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(setReviewOptOut).not.toHaveBeenCalled();
  });

  /**
   * The one action that does mute. It is directly postable, like every server action, and the
   * marker that leads to it is not a secret — any customer can type it. What makes that sound
   * is the gate, not obscurity: ownership and the installed status are re-checked here first.
   */
  it("is muted by the acknowledgement action, which the form is given by route", async () => {
    await expect(acknowledgeProblemAction({ status: "idle" }, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(setReviewOptOut).toHaveBeenCalledWith(MINE, true, EMAIL);
  });

  /** Ownership still comes first on the muting route: it is a customer write path like any other. */
  it("refuses a job the acknowledging customer does not own, and mutes nothing", async () => {
    await expect(
      acknowledgeProblemAction({ status: "idle" }, form({ jobId: THEIRS })),
    ).resolves.toEqual({ status: "not-found" });
    expect(setReviewOptOut).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("validates the acknowledging customer's answers exactly as the ordinary route does", async () => {
    const state = await acknowledgeProblemAction({ status: "idle" }, form({ windowText: "", issue: "" }));
    expect(state.status).toBe("invalid");
    expect(setReviewOptOut).not.toHaveBeenCalled();
  });

  /** The job they complained about must not also be completed by the same visit to the page. */
  it("never completes the job on the unhappy path", async () => {
    await expect(acknowledgeProblemAction({ status: "idle" }, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(setStage).not.toHaveBeenCalled();
  });
});

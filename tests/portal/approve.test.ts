import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The db is mocked throughout: .env.local holds production credentials, so no test here may
 * reach a database.
 *
 * `query` stands in for the tagged template neon() returns, so "nothing was written" can be
 * asserted at the statement level: if query was never called, no row was read or written.
 */
const calls: string[] = [];
let results: unknown[][] = [];
const query = vi.fn(async (strings: TemplateStringsArray) => {
  calls.push(/update\s+leads/i.test(strings.join(" ")) ? "stage" : "select");
  return results.shift() ?? [];
});
vi.mock("@/lib/db", () => ({ db: () => query }));

const notifyOwnersOfApproval = vi.fn(async () => {
  calls.push("email");
});
vi.mock("@/lib/portal/send-approval-email", () => ({ notifyOwnersOfApproval }));

const listSharedDocuments = vi.fn(async () => SHARED as unknown[]);
// lib/admin/jobs.ts imports listBlobPathnames from this same module, so the stub must
// provide it too or the mocked module cannot be linked.
vi.mock("@/lib/admin/files", () => ({ listSharedDocuments, listBlobPathnames: vi.fn(async () => []) }));

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
// after() runs its callback inline here so the ordering assertion can see the email.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
// redirect() works by throwing, so the thrown path is what a test can read the URL off.
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const dcApprove = {
  offeredVersions: vi.fn(async (_id: string) => [] as unknown[]), approveDcQuote: vi.fn(), APPROVAL_ACTOR: "Sent on approval",
};
vi.mock("@/lib/dc/approve", () => dcApprove);
const dcSend = { sendContract: vi.fn() };
vi.mock("@/lib/dc/send", () => dcSend);

const { approveQuote } = await import("@/lib/portal/approve");
const { approveQuoteAction, approveQuoteFormAction } = await import("@/app/(site)/project/actions");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const EMAIL = "john@example.com";
const QUOTE_NAME = "Quote - Living room.pdf";

let SHARED: { id: string; name: string; docType: string | null }[] = [];
const quoteDoc = { id: "f1", name: QUOTE_NAME, docType: "quote" };

const job = { id: MINE, name: "John Ramos", projectNo: 1048, status: "quoted" };

/** setStage's one statement moved the row and logged the event. */
const MOVED = () => [[{ id: "e1" }]];
/** The same statement when the job is already sold: the `status <> $to` guard wrote nothing. */
const UNMOVED = () => [[]];

const statementOf = (call: unknown[]): string => {
  const [strings, ...params] = call as [TemplateStringsArray, ...unknown[]];
  return strings.map((part, i) => part + (i < params.length ? `$${i + 1}` : "")).join("");
};

beforeEach(() => {
  calls.length = 0;
  results = [];
  SHARED = [quoteDoc];
  query.mockClear();
  listSharedDocuments.mockClear();
  notifyOwnersOfApproval.mockReset().mockImplementation(async () => {
    calls.push("email");
  });
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job] });
  revalidatePath.mockReset();
  redirect.mockClear();
  dcApprove.offeredVersions.mockReset().mockResolvedValue([]);
  dcApprove.approveDcQuote.mockReset();
  dcSend.sendContract.mockReset();
});

/** The load-bearing rule: a job the caller does not own answers exactly like one that does not exist. */
describe("ownership", () => {
  it("refuses a job the customer does not own and writes nothing", async () => {
    await expect(approveQuoteAction(THEIRS)).resolves.toBe("not-found");

    // The assertion with teeth. The return-value assertion above would still pass with the
    // ownership check deleted: the unguarded path reaches the database, moves nothing for a
    // job that is not there, and answers the same way. Only proving that no statement ran
    // at all separates "refused before touching anything" from "tried and happened to fail".
    expect(query).not.toHaveBeenCalled();
    expect(listSharedDocuments).not.toHaveBeenCalled();
    expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(dcApprove.offeredVersions).not.toHaveBeenCalled();
  });

  /**
   * F2. Spec §6: a foreign id is refused IDENTICALLY to one that does not exist.
   *
   * This compared the two answers to EACH OTHER, which cannot prove that — it passes whenever
   * they regress together, and mutation M9 demonstrated exactly that, turning both refusals into
   * "wrong-status" while this stayed green. Its sibling on the acknowledge side had the same
   * defect and was fixed; this one was missed because the fix brief believed this file already
   * had the right shape. The literal is the assertion, on both sides.
   */
  it("answers a job that does not exist the same way, telling the caller nothing apart", async () => {
    await expect(approveQuoteAction("8c1e3f2b-4a53-4c52-9a1c-2d3e4f5a6b7c")).resolves.toBe("not-found");
    await expect(approveQuoteAction(THEIRS)).resolves.toBe("not-found");
    expect(query).not.toHaveBeenCalled();
  });

  it("re-derives the jobs from the session rather than trusting the id", async () => {
    results = MOVED();
    await approveQuoteAction(MINE);
    expect(requireCustomer).toHaveBeenCalledTimes(1);
  });
});

describe("the status precondition", () => {
  it("refuses when the job is not quoted, and never takes the target status from the caller", async () => {
    // `approved` is deliberately not in this list: a job already at the destination is an approval
    // that already happened, and it is covered by its own test below.
    for (const status of ["signed", "sold", "ordered", "installed", "completed"]) {
      requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status }] });
      await expect(approveQuoteAction(MINE)).resolves.toBe("wrong-status");
      expect(query).not.toHaveBeenCalled();
    }
  });

  it("moves the job once when approved twice", async () => {
    results = MOVED();
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(calls.filter((entry) => entry === "stage")).toHaveLength(1);

    // The second submission arrives after the job has moved. Spec §4: it answers with the same
    // success the first did — the job is approved, which is what they asked for — and moves nothing.
    query.mockClear();
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "approved" }] });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(query).not.toHaveBeenCalled();
  });

  /**
   * Spec §4: "A second approval returns the same success the first did." The customer is told
   * their quote is approved, which is true — the job is approved. Saying "wrong status" here would
   * be both unhelpful and, once the page speaks, a lie about a job that really is approved.
   */
  it("answers a re-approval of an already-approved job with the same success, writing nothing", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "approved" }] });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");

    // Success is the answer, but nothing happens twice: no statement, no second email to the
    // owners, and no revalidation of a page nothing changed on.
    expect(query).not.toHaveBeenCalled();
    expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("writes nothing on a second approval even if the precondition is somehow passed", async () => {
    // setStage's own `status <> $to` guard is the backstop: the update matches no row, so
    // no event row is returned and nothing moved a second time.
    results = UNMOVED();
    // Not "not-found": the caller has already established the job exists, so the only thing the
    // declined move can mean is that the job was not in the status this transition starts from.
    await expect(approveQuote(MINE, EMAIL, QUOTE_NAME)).resolves.toBe("wrong-status");
    expect(statementOf(query.mock.calls[0])).toMatch(/status\s*<>/i);
  });
});

describe("the shared-quote precondition", () => {
  it("refuses when no Quote document is shared", async () => {
    // Approving something they cannot read is not consent.
    SHARED = [];
    await expect(approveQuoteAction(MINE)).resolves.toBe("no-quote");
    expect(query).not.toHaveBeenCalled();
  });

  it("does not accept a shared document of some other type as the quote", async () => {
    SHARED = [{ id: "f2", name: "Invoice.pdf", docType: "invoice" }];
    await expect(approveQuoteAction(MINE)).resolves.toBe("no-quote");
    expect(query).not.toHaveBeenCalled();
  });

  it("checks the shared documents in the action, not only on the page", async () => {
    SHARED = [];
    await approveQuoteAction(MINE);
    // The page-level condition is a UI nicety; this is the guard.
    expect(listSharedDocuments).toHaveBeenCalledWith(MINE);
  });

  it("refuses a quote name the caller supplies rather than one that is actually shared", async () => {
    await expect(approveQuote(MINE, EMAIL, "")).resolves.toBe("no-quote");
    expect(query).not.toHaveBeenCalled();
  });
});

describe("approveQuote", () => {
  it("moves the job to approved with the customer as actor and a body naming the document", async () => {
    results = MOVED();
    await expect(approveQuote(MINE, EMAIL, QUOTE_NAME)).resolves.toBe("approved");
    const [, ...values] = query.mock.calls.at(-1) as unknown[];
    expect(values).toContain("approved");
    expect(values).toContain(EMAIL);
    expect(values.some((v) => typeof v === "string" && v.includes(QUOTE_NAME))).toBe(true);
  });

  it("records the approval as the customer's own act, in words an owner can read back", async () => {
    results = MOVED();
    await approveQuote(MINE, EMAIL, QUOTE_NAME);
    const body = (query.mock.calls.at(-1) as unknown[]).find(
      (value) => typeof value === "string" && value.startsWith("Approved"),
    );
    expect(body).toBe(`Approved "${QUOTE_NAME}" from their project page`);
  });

  it("never writes lost_reason, which belongs to Lost alone", async () => {
    results = MOVED();
    await approveQuote(MINE, EMAIL, QUOTE_NAME);
    const [, ...values] = query.mock.calls.at(-1) as unknown[];
    // setStage nulls lost_reason for every move that is not to lost.
    expect(values.filter((value) => value === null)).not.toHaveLength(0);
  });
});

describe("approveQuoteAction", () => {
  it("moves the job before sending any email", async () => {
    results = MOVED();
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(calls).toEqual(["stage", "email"]);
    expect(calls.indexOf("stage")).toBeLessThan(calls.indexOf("email"));
  });

  it("keeps the approval even when the notification email fails", async () => {
    results = MOVED();
    notifyOwnersOfApproval.mockRejectedValueOnce(new Error("Resend is down"));
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(calls).toContain("stage");
  });

  it("tells the owners who approved, and which document", async () => {
    results = MOVED();
    await approveQuoteAction(MINE);
    expect(notifyOwnersOfApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: MINE }),
      QUOTE_NAME,
      EMAIL,
      "paperwork",
    );
  });

  it("revalidates both the single-job page and the job's own path", async () => {
    results = MOVED();
    await approveQuoteAction(MINE);
    // A single-job customer's page IS /project, so revalidating only [jobId] leaves the
    // common case stale.
    expect(revalidatePath).toHaveBeenCalledWith("/project");
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  it("sends no email and revalidates nothing when the move did not happen", async () => {
    results = UNMOVED();
    await expect(approveQuoteAction(MINE)).resolves.not.toBe("approved");
    expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  /** "not-found" must mean not found: an already-sold job plainly exists. */
  it("never answers not-found for a job that exists", async () => {
    results = UNMOVED();
    await expect(approveQuoteAction(MINE)).resolves.not.toBe("not-found");
  });
});

/**
 * The form's wrapper. The customer must be told what happened, and the only way a plain form
 * post can say anything is to carry it back on the URL — the same mechanism `?requested=`
 * already uses on this page. Nothing here needs JavaScript.
 */
describe("approveQuoteFormAction", () => {
  const post = (jobId: string) => {
    const data = new FormData();
    data.set("jobId", jobId);
    return approveQuoteFormAction(data);
  };

  it("lands the customer back on their project saying it was approved", async () => {
    results = MOVED();
    await expect(post(MINE)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?approved=1`);
  });

  it("says so on the URL when the approval was refused", async () => {
    SHARED = [];
    await expect(post(MINE)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?approved=no`);
  });

  /** A refusal must still land them somewhere that says something, not silently re-render. */
  it("redirects on every outcome, never returning silently", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "ordered" }] });
    await expect(post(MINE)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("tells a re-approval the same success, since the job really is approved", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "approved" }] });
    await expect(post(MINE)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?approved=1`);
  });
});

describe("a Direct Connect quote (spec §2)", () => {
  const V = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const offered = { id: V, version: 2, option: "A", quoteFileId: "fq", approvedAt: null as Date | null, clientTotalCents: 450000 };
  const dcQuote = { id: "fq", name: "Quote PSS-1048 v2.pdf", docType: "quote" };

  beforeEach(() => {
    dcApprove.offeredVersions.mockResolvedValue([offered]);
    dcApprove.approveDcQuote.mockResolvedValue({ version: 2, option: "A", moved: true });
    dcSend.sendContract.mockResolvedValue({ ok: true, emailed: true });
    SHARED = [dcQuote];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("records the approval, then sends that version's contract as the automatic sender, then tells the owners", async () => {
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcApprove.approveDcQuote).toHaveBeenCalledWith(MINE, V, EMAIL);
    expect(dcSend.sendContract).toHaveBeenCalledWith({ jobId: MINE, versionId: V, actor: "Sent on approval" });
    expect(dcApprove.approveDcQuote.mock.invocationCallOrder[0]).toBeLessThan(dcSend.sendContract.mock.invocationCallOrder[0]);
    expect(notifyOwnersOfApproval).toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), "Quote PSS-1048 v2.pdf", EMAIL, "contract-sent", "PSS-1048");
    // approveDcQuote's own statement moved the job; setStage is not used on this path.
    expect(query).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  it("tells the owners a change order was approved, not that the job moved, when the stage stayed put", async () => {
    dcApprove.approveDcQuote.mockResolvedValue({ version: 3, option: "A", moved: false });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(notifyOwnersOfApproval).toHaveBeenLastCalledWith(expect.objectContaining({ id: MINE }), "Quote PSS-1048 v2.pdf", EMAIL, "change-contract-sent", "PSS-1048");
    dcSend.sendContract.mockRejectedValueOnce(new Error("Blob put failed"));
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(notifyOwnersOfApproval).toHaveBeenLastCalledWith(expect.anything(), "Quote PSS-1048 v2.pdf", EMAIL, "change-contract-failed", "PSS-1048");
  });

  it("keeps the approval when the contract throws or is refused, and tells the owners it was not sent", async () => {
    dcSend.sendContract.mockRejectedValueOnce(new Error("Blob put failed"));
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(notifyOwnersOfApproval).toHaveBeenLastCalledWith(expect.anything(), "Quote PSS-1048 v2.pdf", EMAIL, "contract-failed", "PSS-1048");
    dcSend.sendContract.mockResolvedValueOnce({ error: "Your contract terms file could not be read. Add your contract terms on the Documents page." });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(notifyOwnersOfApproval).toHaveBeenLastCalledWith(expect.anything(), "Quote PSS-1048 v2.pdf", EMAIL, "contract-failed", "PSS-1048");
  });

  // Task 8's review: the approval is saved before the contract step, so a PDF or Blob failure
  // leaves it standing (nothing runs to undo it), the page still refreshes, and the owners' email
  // is really sent, saying the contract was not, so Send contract on the Quote tab recovers it.
  it("on a PDF failure: nothing undoes the approval, the owners' email goes out, and the page refreshes", async () => {
    dcSend.sendContract.mockRejectedValueOnce(new Error("PDF render failed"));
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcApprove.approveDcQuote).toHaveBeenCalledTimes(1);
    expect(notifyOwnersOfApproval).toHaveBeenCalledTimes(1);
    expect(notifyOwnersOfApproval).toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), "Quote PSS-1048 v2.pdf", EMAIL, "contract-failed", "PSS-1048");
    expect(calls).toEqual(["email"]);
    // No statement of the action's own ran after the failure: nothing reverted the approval.
    expect(query).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/project");
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  it("is a no-op the second time: an approved quote sends and emails nothing again", async () => {
    dcApprove.offeredVersions.mockResolvedValue([{ ...offered, approvedAt: new Date() }]);
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
    expect(dcSend.sendContract).not.toHaveBeenCalled();
    expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
  });

  it("answers approved, sending nothing, when a racing tap approved first", async () => {
    dcApprove.approveDcQuote.mockResolvedValue(null);
    dcApprove.offeredVersions.mockResolvedValueOnce([offered]).mockResolvedValueOnce([{ ...offered, approvedAt: new Date() }]);
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcSend.sendContract).not.toHaveBeenCalled();
    expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
  });

  it("refuses when the offered version's own quote PDF is not shared", async () => {
    SHARED = [{ id: "older", name: "Quote PSS-1048 v1.pdf", docType: "quote" }];
    await expect(approveQuoteAction(MINE)).resolves.toBe("no-quote");
    expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
  });

  it("approves a change sent to a job already past Quoted (Review Focus 5)", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "sold" }] });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcSend.sendContract).toHaveBeenCalled();
  });

  it("refuses a Lost job before reading anything", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "lost" }] });
    await expect(approveQuoteAction(MINE)).resolves.toBe("wrong-status");
    expect(dcApprove.offeredVersions).not.toHaveBeenCalled();
  });

  it("refuses a posted version id when nothing is offered, never approving an uploaded quote instead", async () => {
    dcApprove.offeredVersions.mockResolvedValue([]);
    SHARED = [quoteDoc];
    results = MOVED();
    await expect(approveQuoteAction(MINE, V)).resolves.toBe("wrong-status");
    expect(query).not.toHaveBeenCalled();
  });

  describe("with two options offered (quote options spec §6)", () => {
    const VB = "8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
    const optionB = { id: VB, version: 1, option: "B", quoteFileId: "fqb", approvedAt: null as Date | null, clientTotalCents: 500000 };

    beforeEach(() => {
      dcApprove.offeredVersions.mockResolvedValue([offered, optionB]);
      dcApprove.approveDcQuote.mockResolvedValue({ version: 1, option: "B", moved: true });
      SHARED = [dcQuote, { id: "fqb", name: "Quote PSS-1048-B v1.pdf", docType: "quote" }];
    });

    it("approves the option the form names, from this job's own offered versions, and names it to the owners", async () => {
      await expect(approveQuoteAction(MINE, VB)).resolves.toBe("approved");
      expect(dcApprove.approveDcQuote).toHaveBeenCalledWith(MINE, VB, EMAIL);
      expect(dcSend.sendContract).toHaveBeenCalledWith({ jobId: MINE, versionId: VB, actor: "Sent on approval" });
      expect(notifyOwnersOfApproval).toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), "Quote PSS-1048-B v1.pdf", EMAIL, "contract-sent", "PSS-1048-B");
    });

    it("refuses a version id that is not one of this job's offered versions, approving nothing", async () => {
      await expect(approveQuoteAction(MINE, "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f")).resolves.toBe("wrong-status");
      expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
      expect(dcSend.sendContract).not.toHaveBeenCalled();
    });

    it("refuses to guess when two are offered and the form names none", async () => {
      // Primed so the uploaded-quote path WOULD succeed: the refusal must come before it, not from it.
      results = MOVED();
      await expect(approveQuoteAction(MINE)).resolves.toBe("wrong-status");
      expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
    });

    /** Two tabs approving A and B at once lock version rows in opposite order; Postgres aborts one (40P01). */
    const deadlock = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });

    it("answers approved, sending nothing, when its statement lost a deadlock but this option was approved", async () => {
      dcApprove.approveDcQuote.mockRejectedValue(deadlock());
      dcApprove.offeredVersions
        .mockResolvedValueOnce([offered, optionB])
        .mockResolvedValueOnce([offered, { ...optionB, approvedAt: new Date() }]);
      await expect(approveQuoteAction(MINE, VB)).resolves.toBe("approved");
      expect(dcSend.sendContract).not.toHaveBeenCalled();
      expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
    });

    it("answers wrong-status when its statement lost a deadlock to the other option's approval", async () => {
      dcApprove.approveDcQuote.mockRejectedValue(deadlock());
      dcApprove.offeredVersions
        .mockResolvedValueOnce([offered, optionB])
        .mockResolvedValueOnce([{ ...offered, approvedAt: new Date() }]);
      await expect(approveQuoteAction(MINE, VB)).resolves.toBe("wrong-status");
      expect(dcSend.sendContract).not.toHaveBeenCalled();
      expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
    });

    it("still throws any error that is not a deadlock", async () => {
      dcApprove.approveDcQuote.mockRejectedValue(Object.assign(new Error("connection reset"), { code: "08006" }));
      await expect(approveQuoteAction(MINE, VB)).rejects.toThrow("connection reset");
      expect(dcSend.sendContract).not.toHaveBeenCalled();
    });

    it("on a lost race re-checks the option it tapped, not the first one listed", async () => {
      dcApprove.approveDcQuote.mockResolvedValue(null);
      dcApprove.offeredVersions
        .mockResolvedValueOnce([offered, optionB])
        .mockResolvedValueOnce([offered, { ...optionB, approvedAt: new Date() }]);
      await expect(approveQuoteAction(MINE, VB)).resolves.toBe("approved");
      expect(dcSend.sendContract).not.toHaveBeenCalled();
    });

    it("the form carries the version id through", async () => {
      const data = new FormData();
      data.set("jobId", MINE);
      data.set("versionId", VB);
      await expect(approveQuoteFormAction(data)).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?approved=1`);
      expect(dcApprove.approveDcQuote).toHaveBeenCalledWith(MINE, VB, EMAIL);
    });
  });
});

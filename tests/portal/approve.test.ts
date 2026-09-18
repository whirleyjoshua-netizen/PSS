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

const { approveQuote } = await import("@/lib/portal/approve");
const { approveQuoteAction } = await import("@/app/(site)/project/actions");

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
  });

  it("answers a job that does not exist the same way, telling the caller nothing apart", async () => {
    const missing = await approveQuoteAction("8c1e3f2b-4a53-4c52-9a1c-2d3e4f5a6b7c");
    expect(missing).toBe(await approveQuoteAction(THEIRS));
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
    for (const status of ["sold", "ordered", "installed", "completed"]) {
      requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status }] });
      await expect(approveQuoteAction(MINE)).resolves.toBe("wrong-status");
      expect(query).not.toHaveBeenCalled();
    }
  });

  it("moves the job once when approved twice", async () => {
    results = MOVED();
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(calls.filter((entry) => entry === "stage")).toHaveLength(1);

    // The second submission arrives after the job has moved, so the status precondition
    // refuses it before any statement runs at all.
    query.mockClear();
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "sold" }] });
    await expect(approveQuoteAction(MINE)).resolves.toBe("wrong-status");
    expect(query).not.toHaveBeenCalled();
  });

  it("writes nothing on a second approval even if the precondition is somehow passed", async () => {
    // setStage's own `status <> $to` guard is the backstop: the update matches no row, so
    // no event row is returned and nothing moved a second time.
    results = UNMOVED();
    await expect(approveQuote(MINE, EMAIL, QUOTE_NAME)).resolves.toBe("not-found");
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
  it("moves the job to sold with the customer as actor and a body naming the document", async () => {
    results = MOVED();
    await expect(approveQuote(MINE, EMAIL, QUOTE_NAME)).resolves.toBe("approved");
    const [, ...values] = query.mock.calls.at(-1) as unknown[];
    expect(values).toContain("sold");
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
});

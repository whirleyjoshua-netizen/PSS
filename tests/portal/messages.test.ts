import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The db is mocked throughout: migration 019 widens the job_events kind constraint but has
 * not been applied to any database, and .env.local holds production credentials.
 *
 * `query` stands in for the tagged template neon() returns, so "nothing was written" can be
 * asserted at the statement level: if query was never called, no row was read or inserted.
 * Every call records itself in `calls` and takes its result from `results`, so the recording
 * can never be bypassed the way a per-call mockResolvedValueOnce would bypass it.
 */
const calls: string[] = [];
let results: unknown[][] = [];
const query = vi.fn(async (strings: TemplateStringsArray) => {
  calls.push(/insert/i.test(strings.join(" ")) ? "insert" : "select");
  return results.shift() ?? [];
});
vi.mock("@/lib/db", () => ({ db: () => query }));

const notifyOwnersOfMessage = vi.fn(async () => {
  calls.push("email");
});
vi.mock("@/lib/portal/send-message-email", () => ({ notifyOwnersOfMessage }));

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
// after() runs its callback inline here so the ordering assertion can see the email.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

const { sendMessage, listMessages, MESSAGE_MAX } = await import("@/lib/portal/messages");
const { sendCustomerMessage } = await import("@/app/(site)/project/actions");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const EMAIL = "maria@example.com";
const job = { id: MINE, name: "Maria Lopez", projectNo: 1002 };

/** The one statement inserts its row: a clean send. An empty result means it was throttled. */
const CLEAN_SEND = () => [[{ id: "e1" }]];

/**
 * Rebuilds one recorded call as the statement Postgres would see, with $1, $2 … where the
 * bound parameters go. The raw template array alone has no placeholders in it, so a cast
 * like `$2::text` is only visible once the two halves are interleaved.
 */
const statementOf = (call: unknown[]): string => {
  const [strings, ...params] = call as [TemplateStringsArray, ...unknown[]];
  return strings.map((part, i) => part + (i < params.length ? `$${i + 1}` : "")).join("");
};

beforeEach(() => {
  calls.length = 0;
  results = [];
  query.mockClear();
  notifyOwnersOfMessage.mockReset().mockImplementation(async () => {
    calls.push("email");
  });
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job] });
  revalidatePath.mockReset();
});

/** The load-bearing rule: a job the caller does not own answers exactly like one that does not exist. */
describe("ownership", () => {
  it("refuses a job the customer does not own, and writes nothing at all", async () => {
    await expect(sendCustomerMessage(THEIRS, "hello")).resolves.toBe("not-found");

    // These two assertions are the ownership guard's only real teeth. Do not remove them.
    // The return-value assertion above would still pass with the guard deleted: the
    // unguarded path reaches the database, inserts nothing for a job that is not there,
    // and answers "not-found" anyway. Only proving that no statement ran at all
    // distinguishes "refused before touching anything" from "tried and happened to fail".
    expect(query).not.toHaveBeenCalled();
    expect(notifyOwnersOfMessage).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("answers a job that does not exist the same way, telling the caller nothing apart", async () => {
    const missing = await sendCustomerMessage("8c1e3f2b-4a53-4c52-9a1c-2d3e4f5a6b7c", "hello");
    expect(missing).toBe(await sendCustomerMessage(THEIRS, "hello"));
    expect(query).not.toHaveBeenCalled();
  });

  it("re-derives the jobs from the session on every call rather than trusting the id", async () => {
    results = CLEAN_SEND();
    await sendCustomerMessage(MINE, "hello");
    expect(requireCustomer).toHaveBeenCalledTimes(1);
  });
});

describe("sendMessage", () => {
  it("rejects a body over 2000 characters without touching the database", async () => {
    await expect(sendMessage(MINE, "x".repeat(MESSAGE_MAX + 1), EMAIL)).resolves.toBe("too-long");
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts a body of exactly 2000 characters", async () => {
    results = CLEAN_SEND();
    await expect(sendMessage(MINE, "x".repeat(MESSAGE_MAX), EMAIL)).resolves.toBe("sent");
  });

  it("treats a whitespace-only body as a quiet no-op", async () => {
    await expect(sendMessage(MINE, "   \n  ", EMAIL)).resolves.toBe("empty");
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts a second message inside the window without erroring", async () => {
    results = [[]]; // the guarded insert wrote nothing
    await expect(sendMessage(MINE, "again", EMAIL)).resolves.toBe("throttled");
  });

  it("lets a message through once the window has passed", async () => {
    results = CLEAN_SEND();
    await expect(sendMessage(MINE, "again", EMAIL)).resolves.toBe("sent");
  });

  it("decides the throttle in the same statement that writes, so two sends cannot race", async () => {
    results = CLEAN_SEND();
    await sendMessage(MINE, "hello", EMAIL);
    // One statement only: no read-then-write gap for a concurrent send to slip through.
    expect(calls).toEqual(["insert"]);
    const statement = statementOf(query.mock.calls[0]);
    expect(statement).toMatch(/insert\s+into\s+job_events/i);
    expect(statement).toMatch(/where\s+not\s+exists/i);
  });

  it("binds the throttle window the way the login tokens already do", async () => {
    results = CLEAN_SEND();
    await sendMessage(MINE, "hello", EMAIL);
    const statement = statementOf(query.mock.calls[0]);
    // A text parameter with an explicit ::interval cast, as lib/portal/login.ts and
    // lib/admin/login.ts bind a duration. make_interval(secs => $n) leaves the parameter's
    // type to resolution that nothing here has ever run against Postgres.
    expect(statement).toMatch(/::interval/);
    expect(statement).not.toMatch(/make_interval/);
    expect(query.mock.calls[0]).toContain("60 seconds");
  });

  it("states the type of every parameter whose type would otherwise be inferred", async () => {
    results = CLEAN_SEND();
    await sendMessage(MINE, "hello", EMAIL);
    // The actor and body sit in a SELECT list, not a VALUES row, so the insert target does
    // not bind them directly.
    expect(statementOf(query.mock.calls[0])).toMatch(/select\s+\$1::uuid,\s*\$2::text,\s*'message',\s*\$3::text/i);
  });

  it("measures the window against the customer's own messages only", async () => {
    results = CLEAN_SEND();
    await sendMessage(MINE, "hello", EMAIL);
    // An owner-authored 'message' event on the same job must never throttle the customer.
    const statement = statementOf(query.mock.calls[0]);
    expect(statement).toMatch(/actor\s*=/);
    expect(query.mock.calls[0]).toContain(EMAIL);
  });

  it("stores the trimmed body under the customer's own address", async () => {
    results = CLEAN_SEND();
    await sendMessage(MINE, "  when will you arrive?  ", EMAIL);
    expect(query.mock.calls[0]).toContain("when will you arrive?");
    expect(query.mock.calls[0]).toContain(EMAIL);
  });
});

describe("listMessages", () => {
  it("returns the customer's own messages, newest first", async () => {
    const at = new Date("2026-09-14T17:00:00Z");
    results = [[{ body: "hello", created_at: at }]];
    await expect(listMessages(MINE, EMAIL)).resolves.toEqual([{ body: "hello", createdAt: at }]);
    const statement = statementOf(query.mock.calls[0]);
    expect(statement).toMatch(/kind\s*=\s*'message'/);
    expect(statement).toMatch(/desc/i);
  });

  it("returns only rows written by this customer, not every 'message' event on the job", async () => {
    // These bodies render on the customer's page, so the query decides what qualifies —
    // not the convention that nothing else writes this kind today.
    results = [[]];
    await listMessages(MINE, EMAIL);
    expect(statementOf(query.mock.calls[0])).toMatch(/actor\s*=/);
    expect(query.mock.calls[0]).toContain(EMAIL);
  });
});

describe("sendCustomerMessage", () => {
  it("writes the message as a job event before sending any email", async () => {
    results = CLEAN_SEND();
    await expect(sendCustomerMessage(MINE, "hello")).resolves.toBe("sent");
    expect(calls).toEqual(["insert", "email"]);
    expect(calls.indexOf("insert")).toBeLessThan(calls.indexOf("email"));
  });

  it("keeps the customer's words even when the email fails", async () => {
    results = CLEAN_SEND();
    notifyOwnersOfMessage.mockRejectedValueOnce(new Error("Resend is down"));
    await expect(sendCustomerMessage(MINE, "hello")).resolves.toBe("sent");
    expect(calls).toContain("insert");
  });

  it("sends no email for a throttled or empty message", async () => {
    results = [[]];
    await expect(sendCustomerMessage(MINE, "again")).resolves.toBe("throttled");
    await expect(sendCustomerMessage(MINE, "  ")).resolves.toBe("empty");
    expect(notifyOwnersOfMessage).not.toHaveBeenCalled();
  });

  it("refreshes both the single-job page and the one addressed by id", async () => {
    results = CLEAN_SEND();
    await sendCustomerMessage(MINE, "hello");
    expect(revalidatePath).toHaveBeenCalledWith("/project");
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });
});

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

/** The throttle read finds nothing, then the insert returns its row: a clean send. */
const CLEAN_SEND = () => [[], [{ id: "e1" }]];

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
    results = [[{ created_at: new Date() }]];
    await expect(sendMessage(MINE, "again", EMAIL)).resolves.toBe("throttled");
    expect(calls).toEqual(["select"]); // read the last message, wrote nothing
  });

  it("lets a message through once the window has passed", async () => {
    results = [[{ created_at: new Date(Date.now() - 10 * 60_000) }], [{ id: "e1" }]];
    await expect(sendMessage(MINE, "again", EMAIL)).resolves.toBe("sent");
  });

  it("stores the trimmed body under the customer's own address", async () => {
    results = CLEAN_SEND();
    await sendMessage(MINE, "  when will you arrive?  ", EMAIL);
    expect(calls).toEqual(["select", "insert"]);
    expect(query.mock.calls[1]).toContain("when will you arrive?");
    expect(query.mock.calls[1]).toContain(EMAIL);
  });
});

describe("listMessages", () => {
  it("returns the customer's own messages, newest first", async () => {
    const at = new Date("2026-09-14T17:00:00Z");
    results = [[{ body: "hello", created_at: at }]];
    await expect(listMessages(MINE)).resolves.toEqual([{ body: "hello", createdAt: at }]);
    const statement = query.mock.calls[0][0].join(" ");
    expect(statement).toMatch(/kind\s*=\s*'message'/);
    expect(statement).toMatch(/desc/i);
  });
});

describe("sendCustomerMessage", () => {
  it("writes the message as a job event before sending any email", async () => {
    results = CLEAN_SEND();
    await expect(sendCustomerMessage(MINE, "hello")).resolves.toBe("sent");
    expect(calls).toEqual(["select", "insert", "email"]);
    expect(calls.indexOf("insert")).toBeLessThan(calls.indexOf("email"));
  });

  it("keeps the customer's words even when the email fails", async () => {
    results = CLEAN_SEND();
    notifyOwnersOfMessage.mockRejectedValueOnce(new Error("Resend is down"));
    await expect(sendCustomerMessage(MINE, "hello")).resolves.toBe("sent");
    expect(calls).toContain("insert");
  });

  it("sends no email for a throttled or empty message", async () => {
    results = [[{ created_at: new Date() }]];
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

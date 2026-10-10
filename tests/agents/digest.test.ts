import { describe, it, expect, vi, beforeEach } from "vitest";

const digestFacts = vi.fn();
const getAgentSettings = vi.fn();
const setDigestAt = vi.fn();
vi.mock("@/lib/agents/store", () => ({ digestFacts, getAgentSettings, setDigestAt }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { digestEmail, sendAgentDigest } = await import("@/lib/agents/digest");

const now = new Date("2026-10-12T17:30:00Z");
const lastDigestAt = new Date("2026-10-09T17:30:00Z");
// Both agents ran this morning (Mon Oct 12, 8:30 and 8:45 in Las Vegas).
const ranToday = [
  { agentName: "Tara", lastRunAt: new Date("2026-10-12T15:30:00Z") }, { agentName: "Tobi", lastRunAt: new Date("2026-10-12T15:45:00Z") },
];
const empty = { newReports: [], pending: 0, newReplies: 0, failedRuns: [], agentRuns: ranToday };
const facts = {
  newReports: [{ agentSlug: "tara", agentName: "Tara", title: "Daily brief 2026-10-12" }],
  pending: 2, newReplies: 0, failedRuns: [], agentRuns: ranToday,
};

beforeEach(() => {
  digestFacts.mockReset();
  getAgentSettings.mockReset().mockResolvedValue({ mailingAddress: null, signature: null, lastDigestAt });
  setDigestAt.mockReset().mockResolvedValue(undefined);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "owner@example.com,partner@example.com");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("digestEmail", () => {
  it("is null when nothing changed", () => {
    expect(digestEmail(empty, now)).toBeNull();
  });
  it("lists reports per agent, what needs you, replies and failures, with the dashboard link", () => {
    const email = digestEmail({
      newReports: [{ agentSlug: "tara", agentName: "Tara", title: "Daily brief 2026-10-12" }, { agentSlug: "tobi", agentName: "Tobi", title: "Owner report" }],
      pending: 3, newReplies: 1, failedRuns: [{ agentName: "Tobi", note: "Claude login expired" }], agentRuns: ranToday,
    }, now)!;
    expect(email.subject).toBe("Agents for Mon, Oct 12, 2026: 3 need you");
    expect(email.text).toBe([
      "Tara: Daily brief 2026-10-12",
      "Tobi: Owner report",
      "",
      "3 items need you · 1 new reply",
      "⚠ Tobi's run failed: Claude login expired",
      "",
      "Open the dashboard: https://pss.test/admin/agents",
    ].join("\n"));
  });
});

describe("an agent that didn't run", () => {
  // Tobi last ran Friday morning. Monday 10:30 is more than 26 hours later.
  const silent = { ...empty, agentRuns: [ranToday[0], { agentName: "Tobi", lastRunAt: new Date("2026-10-09T15:45:00Z") }] };
  it("adds a line for each agent with no run in the last 26 hours on a weekday, and sends for that alone", () => {
    const email = digestEmail(silent, now)!;
    expect(email).not.toBeNull();
    expect(email.text.split("\n")).toContain("⚠ Tobi hasn't run since Fri, Oct 9, 2026 — is the PC on?");
    expect(email.text).not.toContain("Tara hasn't run");
  });
  it("names an agent that has never run", () => {
    expect(digestEmail({ ...empty, agentRuns: [{ agentName: "Tobi", lastRunAt: null }] }, now)!.text).toContain("⚠ Tobi hasn't run yet — is the PC on?");
  });
  it("says nothing about runs on a weekend", () => {
    // Sunday, two days after Tobi's Friday run.
    expect(digestEmail(silent, new Date("2026-10-11T17:30:00Z"))).toBeNull();
  });
  it("allows up to 26 hours", () => {
    const ranYesterday = { ...empty, agentRuns: [{ agentName: "Tobi", lastRunAt: new Date("2026-10-13T15:45:00Z") }] };
    expect(digestEmail(ranYesterday, new Date("2026-10-14T17:30:00Z"))).toBeNull();
  });
});

describe("sendAgentDigest", () => {
  it("sends to the owners and records the time only after a successful send", async () => {
    digestFacts.mockResolvedValue(facts);
    expect(await sendAgentDigest(now)).toEqual({ sent: 2 });
    expect(digestFacts).toHaveBeenCalledWith(lastDigestAt);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toEqual(["owner@example.com", "partner@example.com"]);
    expect(message.subject).toBe("Agents for Mon, Oct 12, 2026: 2 need you");
    expect(message.text).toContain("Tara: Daily brief 2026-10-12");
    expect(setDigestAt).toHaveBeenCalledWith(now);
    expect(setDigestAt.mock.invocationCallOrder[0]).toBeGreaterThan(send.mock.invocationCallOrder[0]);

    setDigestAt.mockClear();
    send.mockResolvedValue({ error: { message: "down" } });
    const failed = await sendAgentDigest(now);
    expect(failed.sent).toBe(0);
    expect(failed.error).toMatch(/down/);
    expect(setDigestAt).not.toHaveBeenCalled();

    send.mockRejectedValue(new Error("network"));
    const thrown = await sendAgentDigest(now);
    expect(thrown.error).toMatch(/network/);
    expect(setDigestAt).not.toHaveBeenCalled();
  });
  it("sends nothing and records nothing when nothing changed", async () => {
    digestFacts.mockResolvedValue(empty);
    expect(await sendAgentDigest(now)).toEqual({ sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(setDigestAt).not.toHaveBeenCalled();
  });
  it("reports missing configuration and records nothing", async () => {
    digestFacts.mockResolvedValue(facts);
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "");
    expect((await sendAgentDigest(now)).error).toMatch(/not configured/);
    expect(send).not.toHaveBeenCalled();
    expect(setDigestAt).not.toHaveBeenCalled();
  });
});

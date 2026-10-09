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
const empty = { newReports: [], pending: 0, newReplies: 0, failedRuns: [] };
const facts = {
  newReports: [{ agentSlug: "tara", agentName: "Tara", title: "Daily brief 2026-10-12" }],
  pending: 2, newReplies: 0, failedRuns: [],
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
    expect(digestEmail({ newReports: [], pending: 0, newReplies: 0, failedRuns: [] }, now)).toBeNull();
  });
  it("lists reports per agent, what needs you, replies and failures, with the dashboard link", () => {
    const email = digestEmail({
      newReports: [{ agentSlug: "tara", agentName: "Tara", title: "Daily brief 2026-10-12" }, { agentSlug: "tobi", agentName: "Tobi", title: "Owner report" }],
      pending: 3, newReplies: 1, failedRuns: [{ agentName: "Tobi", note: "Claude login expired" }],
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

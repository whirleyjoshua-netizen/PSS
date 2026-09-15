import { describe, it, expect, vi, beforeEach } from "vitest";

const listDueFollowUps = vi.fn();
vi.mock("@/lib/admin/follow-ups", () => ({ listDueFollowUps }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { followUpEmail, sendFollowUpDigest } = await import("@/lib/admin/follow-up-digest");

const now = new Date("2026-10-14T14:00:00Z"); // 7:00 AM Las Vegas
const job = (id: string, name: string, at: string, note: string | null) =>
  ({ id, name, phone: "7025550100", followUpAt: new Date(at), followUpNote: note }) as never;
const overdue = job("00000000-0000-4000-8000-000000000001", "Maria Lopez", "2026-10-13T23:00:00Z", "checking with husband");
const today = job("00000000-0000-4000-8000-000000000002", "Sam Park", "2026-10-14T21:00:00Z", null);

beforeEach(() => {
  listDueFollowUps.mockReset();
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "owner@example.com,partner@example.com");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("followUpEmail", () => {
  it("is null when nothing is due", () => {
    expect(followUpEmail([], now)).toBeNull();
  });
  it("lists overdue first, then today, with phone and tracker link", () => {
    const email = followUpEmail([overdue, today], now)!;
    expect(email.subject).toBe("Call-backs for Wed, Oct 14, 2026: 2");
    expect(email.text).toBe([
      "Overdue",
      "- Maria Lopez · Tue 10/13, 4:00 PM · checking with husband",
      "  (702) 555-0100 · Open in tracker: https://pss.test/admin/jobs/00000000-0000-4000-8000-000000000001",
      "",
      "Today",
      "- Sam Park · Wed 10/14, 2:00 PM",
      "  (702) 555-0100 · Open in tracker: https://pss.test/admin/jobs/00000000-0000-4000-8000-000000000002",
    ].join("\n"));
  });
});

describe("sendFollowUpDigest", () => {
  it("sends nothing when nothing is due", async () => {
    listDueFollowUps.mockResolvedValue([]);
    expect(await sendFollowUpDigest(now)).toEqual({ sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });
  it("emails both owners", async () => {
    listDueFollowUps.mockResolvedValue([overdue, today]);
    expect(await sendFollowUpDigest(now)).toEqual({ sent: 2 });
    expect(send.mock.calls[0][0].to).toEqual(["owner@example.com", "partner@example.com"]);
  });
  it("reports a failed send", async () => {
    listDueFollowUps.mockResolvedValue([today]);
    send.mockResolvedValue({ error: { message: "down" } });
    expect((await sendFollowUpDigest(now)).error).toMatch(/down/);
  });
  it("reports missing configuration", async () => {
    listDueFollowUps.mockResolvedValue([today]);
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "");
    expect((await sendFollowUpDigest(now)).error).toMatch(/not configured/);
  });
});

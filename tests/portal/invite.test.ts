import { describe, it, expect, vi, beforeEach } from "vitest";
import { business } from "@/content/business";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const issueCustomerLink = vi.fn();
vi.mock("@/lib/portal/login", () => ({ issueCustomerLink, INVITE_MINUTES: 10080 }));

const { autoInvite, inviteEmailText, sendPortalInvite } = await import("@/lib/portal/invite");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const row = {
  id: JOB, created_at: "2026-09-01T00:00:00Z", name: "Maria Lopez", phone: "7025550100",
  email: " Maria@Example.com ", address: null, city: "Henderson", treatments: [], window_count: null,
  heard_via: null, notes: null, source: "website", status: "quoted", stage_changed_at: "2026-09-02T00:00:00Z",
  visit_at: null, quote_cents: null, sold_cents: null, deposit_cents: null, brands: [], ordered_on: null,
  install_on: null, lost_reason: null, referral_code: null, referred_by: null, referral_paid_at: null,
  review_requested_at: null, review_opt_out: false, portal_invited_at: null,
};
const claimedRow = { ...row, claimed_at: "2026-09-13 10:00:00.123456" };
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  sql.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  issueCustomerLink.mockReset().mockResolvedValue("https://pss.test/project/auth?token=abc");
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("inviteEmailText", () => {
  it("follows the approved wording", () => {
    const body = inviteEmailText({ firstName: "Maria", link: "https://pss.test/project/auth?token=abc" });
    expect(body).toContain("Hi Maria,");
    expect(body).toContain("You can follow your project, from quote to install, on your own page:");
    expect(body).toContain("https://pss.test/project/auth?token=abc");
    expect(body).toContain("This link works for 7 days. After that, sign in any time at premiershadesolutions.com/project with this email address.");
    expect(body).toContain(`Questions? Call us at ${business.phone.display} or just reply to this email.`);
    expect(body).not.toMatch(/\$\d/);
  });

  it("greets with 'Hi there,' when there is no name", () => {
    const body = inviteEmailText({ firstName: "", link: "https://pss.test/project/auth?token=abc" });
    expect(body).toContain("Hi there,");
  });
});

describe("sendPortalInvite", () => {
  it("sends a 7-day link to the normalized email, then stamps and logs it", async () => {
    const { toJob } = await import("@/lib/admin/jobs");
    await sendPortalInvite(toJob(row), "owner@example.com");

    expect(issueCustomerLink).toHaveBeenCalledWith("maria@example.com", 10080);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("maria@example.com");
    expect(message.subject).toBe("Your Premier Shade Solutions project page");
    expect(message.replyTo).toBe(business.email);
    const record = sql.mock.calls.find((c) => text(c).includes("portal_invited_at = now()"))!;
    expect(text(record)).toContain("insert into job_events");
    expect(record).toEqual(expect.arrayContaining([JOB, "owner@example.com", "Portal invite sent to maria@example.com"]));
  });

  it("throws when Resend rejects it, without recording", async () => {
    const { toJob } = await import("@/lib/admin/jobs");
    send.mockResolvedValue({ error: { message: "down" } });
    await expect(sendPortalInvite(toJob(row), "owner@example.com")).rejects.toThrow(/Resend/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("throws for a job with no email", async () => {
    const { toJob } = await import("@/lib/admin/jobs");
    await expect(sendPortalInvite(toJob({ ...row, email: null }), "owner@example.com")).rejects.toThrow(/email/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("autoInvite", () => {
  it("claims the job before sending, and only an uninvited portal-stage job with an email", async () => {
    query.mockResolvedValue([claimedRow]);
    await autoInvite(JOB);
    const [claim, params] = query.mock.calls[0];
    expect(claim).toContain("portal_invited_at is null");
    expect(claim).toContain("nullif(trim(email), '') is not null");
    expect(claim).toContain("status = any($2::text[])");
    expect(claim).toContain("and portal_auto_invite");
    expect(claim).toContain("portal_invited_at::text as claimed_at");
    expect(params).toEqual([JOB, ["quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"]]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the claim finds nothing (already invited, no email, wrong stage)", async () => {
    await autoInvite(JOB);
    expect(send).not.toHaveBeenCalled();
  });

  it("releases the claim when the send fails, and never throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockResolvedValue([claimedRow]);
    send.mockResolvedValue({ error: { message: "down" } });
    await expect(autoInvite(JOB)).resolves.toBeUndefined();
    const release = sql.mock.calls.find((c) => text(c).includes("portal_invited_at = null"));
    expect(text(release!)).toContain("portal_invited_at = null where id =");
    expect(text(release!)).toContain("and portal_invited_at =");
    expect(release).toContain(JOB);
    expect(release).toContain(claimedRow.claimed_at);
    consoleError.mockRestore();
  });

  it("never throws even when the database is down", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockRejectedValue(new Error("db down"));
    await expect(autoInvite(JOB)).resolves.toBeUndefined();
    consoleError.mockRestore();
  });
});

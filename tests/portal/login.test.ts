import { describe, it, expect, vi, beforeEach } from "vitest";
import { business } from "@/content/business";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const visibleJobs = vi.fn();
vi.mock("@/lib/portal/access", () => ({
  visibleJobs,
  normalizeEmail: (raw: string | null | undefined) => (raw ?? "").trim().toLowerCase(),
}));

const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCallbacks.push(cb); } }));
const runScheduledWork = () => Promise.all(afterCallbacks.splice(0).map((cb) => cb()));

const { consumeCustomerSignIn, issueCustomerLink, requestCustomerSignIn, INVITE_MINUTES } = await import("@/lib/portal/login");
const { hashToken } = await import("@/lib/admin/tokens");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const countIs = (n: number) => async (strings: TemplateStringsArray) =>
  strings.join("?").includes("count(*)") ? [{ count: n }] : [];

beforeEach(() => {
  afterCallbacks.length = 0;
  sql.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  visibleJobs.mockReset().mockResolvedValue([{ id: "job" }]);
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test/");
});

describe("issueCustomerLink", () => {
  it("stores only the hash and returns a link on the configured origin", async () => {
    const link = await issueCustomerLink("maria@example.com", INVITE_MINUTES);
    const token = link.match(/token=([A-Za-z0-9_-]{43})$/)![1];
    expect(link.startsWith("https://pss.test/project/auth?token=")).toBe(true);
    const insert = sql.mock.calls[0];
    expect(text(insert)).toContain("insert into customer_login_tokens");
    expect(insert).toContain(hashToken(token));
    expect(insert).not.toContain(token);
    expect(insert).toContain(`${7 * 24 * 60} minutes`);
  });

  it("falls back to the business domain", async () => {
    vi.stubEnv("ADMIN_BASE_URL", "");
    expect(await issueCustomerLink("maria@example.com", 15)).toContain(`${business.domain}/project/auth?token=`);
  });
});

describe("requestCustomerSignIn", () => {
  it("resolves immediately, doing the work later", async () => {
    expect(await requestCustomerSignIn("maria@example.com")).toBeUndefined();
    expect(visibleJobs).not.toHaveBeenCalled();
  });

  it("emails a 15-minute link to a customer with a visible job", async () => {
    sql.mockImplementation(countIs(0));
    await requestCustomerSignIn(" Maria@Example.com ");
    await runScheduledWork();

    expect(visibleJobs).toHaveBeenCalledWith("maria@example.com");
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("maria@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.text).toMatch(/https:\/\/pss\.test\/project\/auth\?token=[A-Za-z0-9_-]{43}/);
    expect(message.text).toContain("expires in 15 minutes");
    expect(sql.mock.calls.find((c) => text(c).includes("insert into customer_login_tokens"))).toContain("15 minutes");
  });

  it("does nothing for an email with no visible job", async () => {
    visibleJobs.mockResolvedValue([]);
    await requestCustomerSignIn("stranger@example.com");
    await runScheduledWork();
    expect(send).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("stops after five links in an hour", async () => {
    sql.mockImplementation(countIs(5));
    await requestCustomerSignIn("maria@example.com");
    await runScheduledWork();
    expect(send).not.toHaveBeenCalled();
  });

  it("logs failures instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    visibleJobs.mockRejectedValue(new Error("db down"));
    await requestCustomerSignIn("maria@example.com");
    await expect(runScheduledWork()).resolves.toBeDefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("consumeCustomerSignIn", () => {
  it("uses the token once and returns the email while a job is visible", async () => {
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    expect(await consumeCustomerSignIn("tok")).toBe("maria@example.com");
    expect(text(sql.mock.calls[0])).toContain("used_at is null and expires_at > now()");
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
  });

  it("returns null for an unknown, used or expired token", async () => {
    expect(await consumeCustomerSignIn("tok")).toBeNull();
  });

  it("returns null once the customer has no visible job", async () => {
    sql.mockResolvedValue([{ email: "maria@example.com" }]);
    visibleJobs.mockResolvedValue([]);
    expect(await consumeCustomerSignIn("tok")).toBeNull();
  });
});

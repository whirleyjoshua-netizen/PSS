import { describe, it, expect, vi, beforeEach } from "vitest";
import { business } from "@/content/business";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));
const runScheduledWork = () => Promise.all(afterCallbacks.splice(0).map((cb) => cb()));

const { requestSignIn, consumeSignIn } = await import("@/lib/admin/login");
const { hashToken } = await import("@/lib/admin/tokens");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  afterCallbacks.length = 0;
  sql.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("requestSignIn", () => {
  it("resolves immediately for everyone, doing the work later", async () => {
    expect(await requestSignIn("owner@example.com")).toBeUndefined();
    expect(await requestSignIn("stranger@example.com")).toBeUndefined();
  });

  it("emails an allowlisted owner a link on the configured origin", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );

    await requestSignIn(" Owner@Example.com ");
    await runScheduledWork();

    const message = send.mock.calls[0][0];
    expect(message.to).toBe("owner@example.com");
    expect(message.text).toMatch(/https:\/\/pss\.test\/admin\/auth\?token=[A-Za-z0-9_-]{43}/);
  });

  it("falls back to the business domain when ADMIN_BASE_URL is blank", async () => {
    vi.stubEnv("ADMIN_BASE_URL", "");
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );

    await requestSignIn("owner@example.com");
    await runScheduledWork();

    const message = send.mock.calls[0][0];
    expect(message.text).toContain(`${business.domain}/admin/auth?token=`);
  });

  it("strips a trailing slash from ADMIN_BASE_URL", async () => {
    vi.stubEnv("ADMIN_BASE_URL", "https://pss.test/");
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );

    await requestSignIn("owner@example.com");
    await runScheduledWork();

    const message = send.mock.calls[0][0];
    expect(message.text).toContain("https://pss.test/admin/auth?token=");
    expect(message.text).not.toContain("https://pss.test//admin");
  });

  it("stores only the hash of the token it sends", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );
    await requestSignIn("owner@example.com");
    await runScheduledWork();

    const token = send.mock.calls[0][0].text.match(/token=([A-Za-z0-9_-]+)/)[1];
    const insert = sql.mock.calls.find((call) => text(call).includes("insert into admin_login_tokens"))!;
    expect(insert).toContain(hashToken(token));
    expect(insert).not.toContain(token);
  });

  it("says nothing to a stranger and only looks them up", async () => {
    await requestSignIn("stranger@example.com");
    await runScheduledWork();
    expect(send).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
    expect(text(sql.mock.calls[0])).toContain("from admin_access");
  });

  it("emails an admin given access in Settings", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("from admin_access")) return [{ "?column?": 1 }];
      return query.includes("count(*)") ? [{ count: 0 }] : [];
    });
    await requestSignIn("alia@example.com");
    await runScheduledWork();
    expect(send.mock.calls[0][0].to).toBe("alia@example.com");
  });

  it("stops sending after five links in an hour", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 5 }] : [],
    );

    await requestSignIn("owner@example.com");
    await runScheduledWork();
    expect(send).not.toHaveBeenCalled();
  });

  it("logs a failed send instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );
    send.mockResolvedValue({ error: { message: "down" } });

    await requestSignIn("owner@example.com");
    await expect(runScheduledWork()).resolves.toBeDefined();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

describe("consumeSignIn", () => {
  it("returns the email for a fresh, unused, allowlisted token", async () => {
    sql.mockResolvedValue([{ email: "owner@example.com" }]);
    expect(await consumeSignIn("tok")).toBe("owner@example.com");
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
  });

  it("returns null when the token is unknown, used, or expired", async () => {
    sql.mockResolvedValue([]);
    expect(await consumeSignIn("tok")).toBeNull();
  });

  it("returns null when the address has since been removed from the allowlist", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from admin_access") ? [] : [{ email: "former@example.com" }],
    );
    expect(await consumeSignIn("tok")).toBeNull();
  });
});

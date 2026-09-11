import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { requestSignIn, consumeSignIn } = await import("@/lib/admin/login");
const { hashToken } = await import("@/lib/admin/tokens");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("requestSignIn", () => {
  it("emails an allowlisted owner a link on the configured origin", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );

    expect(await requestSignIn(" Owner@Example.com ")).toEqual({ ok: true });

    const message = send.mock.calls[0][0];
    expect(message.to).toBe("owner@example.com");
    expect(message.text).toMatch(/https:\/\/pss\.test\/admin\/auth\?token=[A-Za-z0-9_-]{43}/);
  });

  it("stores only the hash of the token it sends", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );
    await requestSignIn("owner@example.com");

    const token = send.mock.calls[0][0].text.match(/token=([A-Za-z0-9_-]+)/)[1];
    const insert = sql.mock.calls.find((call) => text(call).includes("insert into admin_login_tokens"))!;
    expect(insert).toContain(hashToken(token));
    expect(insert).not.toContain(token);
  });

  it("says the same thing to a stranger but sends nothing", async () => {
    expect(await requestSignIn("stranger@example.com")).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("stops sending after five links in an hour", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 5 }] : [],
    );

    expect(await requestSignIn("owner@example.com")).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a failed email so the owner can try again", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );
    send.mockResolvedValue({ error: { message: "down" } });

    const result = await requestSignIn("owner@example.com");
    expect(result.ok).toBe(false);
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
    sql.mockResolvedValue([{ email: "former@example.com" }]);
    expect(await consumeSignIn("tok")).toBeNull();
  });
});

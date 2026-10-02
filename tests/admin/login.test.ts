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

const { requestSignIn, consumeSignIn, consumeSignInCode, newSignInCode, codeHash } = await import("@/lib/admin/login");
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

describe("sign-in codes", () => {
  it("are always six digits, leading zeros allowed", () => {
    for (let i = 0; i < 200; i++) expect(newSignInCode()).toMatch(/^\d{6}$/);
  });

  it("are hashed together with the address they were sent to", () => {
    expect(codeHash("owner@example.com", "012345")).toBe(hashToken("owner@example.com:012345"));
    expect(codeHash("owner@example.com", "012345")).not.toBe(codeHash("other@example.com", "012345"));
  });

  it("go out in the same email as the link, in the subject, and only the hash is stored", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );
    await requestSignIn(" Owner@Example.com ");
    await runScheduledWork();

    const message = send.mock.calls[0][0];
    expect(message.subject).toMatch(/^Your PSS sign-in code: \d{6}$/);
    const code = message.subject.match(/(\d{6})$/)[1];
    expect(message.text).toContain(`Your sign-in code is ${code}`);
    expect(message.text).toMatch(/https:\/\/pss\.test\/admin\/auth\?token=[A-Za-z0-9_-]{43}/);

    const insert = sql.mock.calls.find((call) => text(call).includes("insert into admin_login_tokens"))!;
    expect(text(insert)).toContain("code_hash");
    expect(insert).toContain(codeHash("owner@example.com", code));
    expect(insert).not.toContain(code);
  });
});

describe("consumeSignInCode", () => {
  it("picks the newest usable sign-in and uses it or counts a wrong try, in one statement", async () => {
    sql.mockResolvedValue([]);
    await consumeSignInCode(" Owner@Example.com ", "012345");

    const calls = sql.mock.calls.filter((call) => text(call).includes("admin_login_tokens"));
    expect(calls).toHaveLength(1);
    const query = text(calls[0]).replace(/\s+/g, " ");
    for (const part of [
      "order by created_at desc limit 1",
      "code_attempts < ?::int",
      "used_at is null",
      "expires_at > now()",
      "code_hash is not null",
      "code_attempts = code_attempts + 1",
      "set used_at = now()",
    ]) expect(query, part).toContain(part);
    expect(calls[0]).toContain("owner@example.com");
    expect(calls[0]).toContain(5);
    expect(calls[0]).toContain(codeHash("owner@example.com", "012345"));
  });

  it("locks only the latest sign-in: the attempts guard sits in the updates, not in the pick", async () => {
    sql.mockResolvedValue([]);
    await consumeSignInCode("owner@example.com", "012345");

    const call = sql.mock.calls.find((c) => text(c).includes("admin_login_tokens"))!;
    const query = text(call).replace(/\s+/g, " ");
    const between = (from: string, to: string) => {
      const start = query.indexOf(from);
      const end = query.indexOf(to, start);
      expect(start, from).toBeGreaterThanOrEqual(0);
      expect(end, to).toBeGreaterThan(start);
      return query.slice(start, end);
    };
    // A locked newest sign-in must not let the pick fall through to an older one.
    expect(between("with target as (", "), used as (")).not.toContain("code_attempts");
    expect(between("), used as (", "), missed as (")).toContain("code_attempts < ?::int");
    expect(between("), missed as (", "select email from used")).toContain("code_attempts < ?::int");
  });

  it("uses a sign-in only when the code matches, counts a miss only when it does not, and locks the row", async () => {
    sql.mockResolvedValue([]);
    await consumeSignInCode("owner@example.com", "012345");

    const call = sql.mock.calls.find((c) => text(c).includes("admin_login_tokens"))!;
    const query = text(call).replace(/\s+/g, " ");
    const section = (from: string, to: string) => {
      const start = query.indexOf(from);
      const end = query.indexOf(to, start);
      expect(start, from).toBeGreaterThanOrEqual(0);
      expect(end, to).toBeGreaterThan(start);
      return query.slice(start, end);
    };
    // Without the match, any six digits would sign in.
    expect(section("), used as (", "), missed as (")).toContain("code_hash = ?");
    expect(section("), missed as (", "select email from used")).toContain("code_hash <> ?");
    // Two guesses at the same sign-in wait for each other.
    expect(section("with target as (", "), used as (")).toContain("for update");
  });

  it("strips spaces from the code before checking it", async () => {
    sql.mockResolvedValue([]);
    await consumeSignInCode("owner@example.com", " 012 345 ");
    expect(sql.mock.calls[0]).toContain(codeHash("owner@example.com", "012345"));
  });

  it("returns the email when the code matched and the address still has access", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("admin_login_tokens") ? [{ email: "owner@example.com" }] : [],
    );
    expect(await consumeSignInCode("owner@example.com", "012345")).toBe("owner@example.com");
  });

  it("returns null when no sign-in was used", async () => {
    sql.mockResolvedValue([]);
    expect(await consumeSignInCode("owner@example.com", "012345")).toBeNull();
  });

  it("returns null when the address has since lost access", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("from admin_access") ? [] : [{ email: "former@example.com" }],
    );
    expect(await consumeSignInCode("former@example.com", "012345")).toBeNull();
  });

  it("refuses anything but six digits, or a blank email, without querying", async () => {
    for (const code of ["", "12345", "1234567", "12a456", "abcdef"]) {
      expect(await consumeSignInCode("owner@example.com", code), code).toBeNull();
    }
    expect(await consumeSignInCode("  ", "012345")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
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

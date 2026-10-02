// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const isAllowed = vi.fn();
vi.mock("@/lib/admin/allowlist", () => ({ isAllowed }));

// Option generation is the real library. Only the two verify calls are stubbed, since they need a
// real authenticator's signature.
const verifyRegistrationResponse = vi.fn();
const verifyAuthenticationResponse = vi.fn();
vi.mock("@simplewebauthn/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@simplewebauthn/server")>()),
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
}));

const passkeys = await import("@/lib/admin/passkeys");
const {
  rpId, expectedOrigin, startRegistration, finishRegistration, startSignIn, finishSignIn,
  listPasskeys, removePasskey, deviceLabel,
} = passkeys;

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ").trim();
const params = (call: unknown[]) => call.slice(1);

const EMAIL = "owner@example.com";
const REG_RESPONSE = { id: "cred-1", rawId: "cred-1", type: "public-key", response: { transports: ["internal", "hybrid"] } };
const AUTH_RESPONSE = { id: "cred-1", rawId: "cred-1", type: "public-key", response: {} };

let savedBase: string | undefined;
beforeEach(() => {
  savedBase = process.env.ADMIN_BASE_URL;
  process.env.ADMIN_BASE_URL = "https://ops.example.com/";
  sql.mockReset().mockResolvedValue([]);
  isAllowed.mockReset().mockResolvedValue(true);
  verifyRegistrationResponse.mockReset();
  verifyAuthenticationResponse.mockReset();
});
afterEach(() => {
  if (savedBase === undefined) delete process.env.ADMIN_BASE_URL;
  else process.env.ADMIN_BASE_URL = savedBase;
});

describe("relying party", () => {
  it("takes the RP ID and origin from configuration, never the request", () => {
    expect(expectedOrigin()).toBe("https://ops.example.com");
    expect(rpId()).toBe("ops.example.com");
  });
});

describe("startRegistration", () => {
  it("asks for a discoverable, user-verified platform passkey for this address", async () => {
    sql.mockResolvedValueOnce([{ id: "old-cred", transports: ["internal"] }]).mockResolvedValueOnce([]);
    const { options, challengeId } = await startRegistration(EMAIL);

    expect(options.rp).toEqual({ name: "PSS Ops", id: "ops.example.com" });
    expect(options.user.name).toBe(EMAIL);
    expect(options.user.displayName).toBe("Owner");
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
      authenticatorAttachment: "platform",
    });
    // A device that already has a passkey for this address is not asked to make another.
    expect(options.excludeCredentials).toEqual([{ id: "old-cred", type: "public-key", transports: ["internal"] }]);
    expect(text(sql.mock.calls[0])).toBe(
      "select id, transports from admin_passkeys where email = ? order by created_at",
    );
    expect(params(sql.mock.calls[0])).toEqual([EMAIL]);

    // The challenge is stored for this address, for registration only, for 5 minutes, sweeping old ones.
    const insert = text(sql.mock.calls[1]);
    expect(insert).toMatch(/^with swept as \( delete from admin_webauthn_challenges where expires_at < now\(\) \)/);
    expect(insert).toContain(
      "insert into admin_webauthn_challenges (id, challenge, purpose, email, expires_at) values (?, ?, 'register', ?, now() + interval '5 minutes')",
    );
    expect(params(sql.mock.calls[1])).toEqual([challengeId, options.challenge, EMAIL]);
    expect(challengeId).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("gives the same address the same user id every time, and another address a different one", async () => {
    const a = (await startRegistration(EMAIL)).options;
    const b = (await startRegistration(EMAIL)).options;
    const c = (await startRegistration("shade@example.com")).options;
    expect(a.user.id).toBe(b.user.id);
    expect(c.user.id).not.toBe(a.user.id);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("finishRegistration", () => {
  const credential = { id: "cred-1", publicKey: new Uint8Array([1, 2, 255]), counter: 0, transports: ["internal"] };

  it("uses the challenge once, for this address and purpose, then stores the passkey", async () => {
    sql.mockResolvedValueOnce([{ challenge: "chal" }]).mockResolvedValueOnce([{ id: "cred-1" }]);
    verifyRegistrationResponse.mockResolvedValue({ verified: true, registrationInfo: { credential } });

    expect(await finishRegistration(EMAIL, "ch-1", REG_RESPONSE as never, "iPhone")).toBe(true);

    expect(text(sql.mock.calls[0])).toBe(
      "delete from admin_webauthn_challenges where id = ? and purpose = 'register' and email = ? and expires_at > now() returning challenge",
    );
    expect(params(sql.mock.calls[0])).toEqual(["ch-1", EMAIL]);
    expect(verifyRegistrationResponse).toHaveBeenCalledWith({
      response: REG_RESPONSE,
      expectedChallenge: "chal",
      expectedOrigin: "https://ops.example.com",
      expectedRPID: "ops.example.com",
      requireUserVerification: true,
    });
    expect(text(sql.mock.calls[1])).toBe(
      "insert into admin_passkeys (id, email, public_key, counter, transports, label) values (?, ?, decode(?, 'hex'), ?, ?::text[], ?) on conflict (id) do nothing returning id",
    );
    expect(params(sql.mock.calls[1])).toEqual(["cred-1", EMAIL, "0102ff", 0, ["internal"], "iPhone"]);
  });

  it("stores nothing when the challenge is gone, expired or for someone else", async () => {
    expect(await finishRegistration(EMAIL, "ch-1", REG_RESPONSE as never, "iPhone")).toBe(false);
    expect(verifyRegistrationResponse).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("stores nothing when verification fails or throws", async () => {
    sql.mockResolvedValue([{ challenge: "chal" }]);
    verifyRegistrationResponse.mockResolvedValueOnce({ verified: false });
    expect(await finishRegistration(EMAIL, "ch-1", REG_RESPONSE as never, "iPhone")).toBe(false);
    verifyRegistrationResponse.mockRejectedValueOnce(new Error("bad origin"));
    expect(await finishRegistration(EMAIL, "ch-1", REG_RESPONSE as never, "iPhone")).toBe(false);
    expect(sql.mock.calls.every((call) => !text(call).startsWith("insert"))).toBe(true);
  });

  it("refuses a malformed response before touching the challenge", async () => {
    expect(await finishRegistration(EMAIL, "ch-1", null as never, "iPhone")).toBe(false);
    expect(await finishRegistration(EMAIL, "", REG_RESPONSE as never, "iPhone")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("startSignIn", () => {
  it("asks for any of this site's passkeys with Face ID required, and stores a sign-in challenge", async () => {
    sql.mockResolvedValueOnce([{ id: "stored" }]);
    const started = await startSignIn();
    expect(started).not.toBeNull();
    const { options, challengeId } = started!;
    expect(options.rpId).toBe("ops.example.com");
    expect(options.userVerification).toBe("required");
    // Discoverable credentials: no address is asked for, so nothing is listed.
    expect(options.allowCredentials ?? []).toEqual([]);

    expect(sql).toHaveBeenCalledTimes(1);
    const insert = text(sql.mock.calls[0]);
    expect(insert).toMatch(/^with swept as \( delete from admin_webauthn_challenges where expires_at < now\(\) \)/);
    expect(insert).toContain(
      "insert into admin_webauthn_challenges (id, challenge, purpose, email, expires_at) select ?, ?, 'sign-in', null, now() + interval '5 minutes'",
    );
    expect(params(sql.mock.calls[0])).toEqual([challengeId, options.challenge, 200]);
  });

  it("refuses once 200 sign-ins are already waiting, counting only live ones, in the same statement", async () => {
    // The insert's own condition finds 200 live rows, so nothing is stored and no row comes back.
    sql.mockResolvedValueOnce([]);
    expect(await startSignIn()).toBeNull();
    expect(sql).toHaveBeenCalledTimes(1);
    // The sweep's deletions are not visible inside the same statement, so the count skips expired rows itself.
    expect(text(sql.mock.calls[0])).toMatch(
      /where \(select count\(\*\) from admin_webauthn_challenges where purpose = 'sign-in' and expires_at > now\(\)\) < \? returning id$/,
    );
    expect(params(sql.mock.calls[0]).at(-1)).toBe(200);
  });
});

describe("finishSignIn", () => {
  const stored = { email: EMAIL, public_key: "0102ff", counter: "7", transports: ["internal"] };
  const verified = { verified: true, authenticationInfo: { newCounter: 8 } };
  const NOT_VERIFIED = { failed: "not-verified" };

  it("verifies against the stored key and counter, moves the counter, and returns the address", async () => {
    sql
      .mockResolvedValueOnce([{ challenge: "chal" }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([{ email: EMAIL }]);
    verifyAuthenticationResponse.mockResolvedValue(verified);

    expect(await finishSignIn("ch-2", AUTH_RESPONSE as never)).toEqual({ email: EMAIL });

    expect(text(sql.mock.calls[0])).toBe(
      "delete from admin_webauthn_challenges where id = ? and purpose = 'sign-in' and expires_at > now() returning challenge",
    );
    expect(params(sql.mock.calls[0])).toEqual(["ch-2"]);
    expect(text(sql.mock.calls[1])).toBe(
      "select email, encode(public_key, 'hex') as public_key, counter, transports from admin_passkeys where id = ?",
    );
    expect(params(sql.mock.calls[1])).toEqual(["cred-1"]);
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith({
      response: AUTH_RESPONSE,
      expectedChallenge: "chal",
      expectedOrigin: "https://ops.example.com",
      expectedRPID: "ops.example.com",
      credential: { id: "cred-1", publicKey: new Uint8Array([1, 2, 255]), counter: 7, transports: ["internal"] },
      requireUserVerification: true,
    });
    // One statement, guarded so a replayed or raced counter never moves backwards.
    expect(text(sql.mock.calls[2])).toBe(
      "update admin_passkeys set counter = ?, last_used_at = now() where id = ? and (counter < ?::bigint or (counter = 0 and ?::bigint = 0)) returning email",
    );
    expect(params(sql.mock.calls[2])).toEqual([8, "cred-1", 8, 8]);
    expect(isAllowed).toHaveBeenCalledWith(EMAIL);
  });

  it("fails for someone whose access was removed, even with a good passkey", async () => {
    sql
      .mockResolvedValueOnce([{ challenge: "chal" }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([{ email: EMAIL }]);
    verifyAuthenticationResponse.mockResolvedValue(verified);
    isAllowed.mockResolvedValue(false);
    expect(await finishSignIn("ch-2", AUTH_RESPONSE as never)).toEqual(NOT_VERIFIED);
  });

  it("fails when the challenge is gone, without looking up the passkey", async () => {
    expect(await finishSignIn("ch-2", AUTH_RESPONSE as never)).toEqual(NOT_VERIFIED);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("says the passkey is unknown when no stored passkey has its id, so the phone can forget it", async () => {
    sql.mockResolvedValueOnce([{ challenge: "chal" }]).mockResolvedValueOnce([]);
    expect(await finishSignIn("ch-2", AUTH_RESPONSE as never)).toEqual({ failed: "unknown-passkey" });
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("fails and moves nothing when verification fails or throws", async () => {
    sql.mockResolvedValueOnce([{ challenge: "chal" }]).mockResolvedValueOnce([stored]);
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false, authenticationInfo: { newCounter: 8 } });
    expect(await finishSignIn("ch-2", AUTH_RESPONSE as never)).toEqual(NOT_VERIFIED);
    sql.mockResolvedValueOnce([{ challenge: "chal" }]).mockResolvedValueOnce([stored]);
    verifyAuthenticationResponse.mockRejectedValueOnce(new Error("counter went backwards"));
    expect(await finishSignIn("ch-2", AUTH_RESPONSE as never)).toEqual(NOT_VERIFIED);
    expect(sql.mock.calls.every((call) => !text(call).startsWith("update"))).toBe(true);
    expect(isAllowed).not.toHaveBeenCalled();
  });

  it("fails when the counter update finds nothing to move", async () => {
    sql.mockResolvedValueOnce([{ challenge: "chal" }]).mockResolvedValueOnce([stored]).mockResolvedValueOnce([]);
    verifyAuthenticationResponse.mockResolvedValue(verified);
    expect(await finishSignIn("ch-2", AUTH_RESPONSE as never)).toEqual(NOT_VERIFIED);
  });

  it("refuses a malformed response before touching the challenge", async () => {
    expect(await finishSignIn("ch-2", { id: 5 } as never)).toEqual(NOT_VERIFIED);
    expect(await finishSignIn("", AUTH_RESPONSE as never)).toEqual(NOT_VERIFIED);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("listPasskeys and removePasskey", () => {
  it("lists one person's devices, oldest first", async () => {
    sql.mockResolvedValue([
      { id: "cred-1", label: "iPhone", created_at: "2026-10-01T15:00:00Z", last_used_at: null },
      { id: "cred-2", label: "Mac", created_at: "2026-10-02T15:00:00Z", last_used_at: "2026-10-03T15:00:00Z" },
    ]);
    expect(await listPasskeys(EMAIL)).toEqual([
      { id: "cred-1", label: "iPhone", createdAt: new Date("2026-10-01T15:00:00Z"), lastUsedAt: null },
      { id: "cred-2", label: "Mac", createdAt: new Date("2026-10-02T15:00:00Z"), lastUsedAt: new Date("2026-10-03T15:00:00Z") },
    ]);
    expect(text(sql.mock.calls[0])).toBe(
      "select id, label, created_at, last_used_at from admin_passkeys where email = ? order by created_at",
    );
    expect(params(sql.mock.calls[0])).toEqual([EMAIL]);
  });

  it("removes a device only when it belongs to that person", async () => {
    sql.mockResolvedValueOnce([{ id: "cred-1" }]).mockResolvedValueOnce([]);
    expect(await removePasskey(EMAIL, "cred-1")).toBe(true);
    expect(await removePasskey(EMAIL, "someone-elses")).toBe(false);
    expect(text(sql.mock.calls[0])).toBe("delete from admin_passkeys where id = ? and email = ? returning id");
    expect(params(sql.mock.calls[0])).toEqual(["cred-1", EMAIL]);
  });
});

describe("deviceLabel", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPhone"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPad"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", "Mac"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36", "Android phone"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36", "Windows PC"],
    ["curl/8.0", "This device"],
    ["", "This device"],
    [null, "This device"],
  ])("labels %s as %s", (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });
});

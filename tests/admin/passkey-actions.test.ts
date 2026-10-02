import { describe, it, expect, vi, beforeEach } from "vitest";

const FAILED = "Face ID sign-in didn't work. Try again, or use the email code.";
const order: string[] = [];

const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { email: "owner@example.com" };
});
const createSession = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin, createSession }));

const passkeys = {
  startRegistration: vi.fn(),
  finishRegistration: vi.fn(),
  startSignIn: vi.fn(),
  finishSignIn: vi.fn(),
  removePasskey: vi.fn(),
  deviceLabel: vi.fn((ua: string | null) => (ua?.includes("iPhone") ? "iPhone" : "This device")),
};
vi.mock("@/lib/admin/passkeys", () => passkeys);

const jar = new Map<string, string>();
const cookieStore = {
  get: vi.fn((name: string) => {
    order.push(`cookie:get:${name}`);
    return jar.has(name) ? { name, value: jar.get(name) } : undefined;
  }),
  set: vi.fn((name: string, value: string) => {
    jar.set(name, value);
  }),
  delete: vi.fn((cookie: string | { name: string; path?: string }) => {
    jar.delete(typeof cookie === "string" ? cookie : cookie.name);
  }),
};
const headerList = new Headers({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" });
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => headerList }));
const redirect = vi.fn((url: string) => {
  throw new Error("NEXT_REDIRECT:" + url);
});
vi.mock("next/navigation", () => ({ redirect }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const actions = await import("@/app/admin/passkey-actions");

const OPTIONS = { challenge: "abc" };
const RESPONSE = { id: "cred-1" };

beforeEach(() => {
  order.length = 0;
  jar.clear();
  requireAdmin.mockClear();
  createSession.mockReset();
  for (const fn of Object.values(passkeys)) fn.mockClear();
  passkeys.startRegistration.mockReset().mockResolvedValue({ options: OPTIONS, challengeId: "reg-1" });
  passkeys.startSignIn.mockReset().mockResolvedValue({ options: OPTIONS, challengeId: "sign-1" });
  passkeys.finishRegistration.mockReset().mockResolvedValue(true);
  passkeys.finishSignIn.mockReset().mockResolvedValue({ email: "owner@example.com" });
  passkeys.removePasskey.mockReset().mockResolvedValue(true);
  cookieStore.get.mockClear();
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  redirect.mockClear();
  revalidatePath.mockClear();
});

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 300, secure: false };
const REG = "pss_webauthn_reg";
const SIGN_IN = "pss_webauthn_signin";
// The cookie is set on /admin, so it must be cleared on /admin too or the browser keeps it.
const CLEARED = (name: string) => ({ name, path: "/admin" });

describe("beginFaceIdSetup", () => {
  it("requires a signed-in admin and binds the challenge to their address, in a 5-minute httpOnly cookie", async () => {
    expect(await actions.beginFaceIdSetup()).toEqual(OPTIONS);
    expect(passkeys.startRegistration).toHaveBeenCalledWith("owner@example.com");
    expect(cookieStore.set).toHaveBeenCalledWith(REG, "reg-1", COOKIE_OPTIONS);
  });

  it("does nothing when nobody is signed in", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/admin/sign-in"));
    await expect(actions.beginFaceIdSetup()).rejects.toThrow("NEXT_REDIRECT:/admin/sign-in");
    expect(passkeys.startRegistration).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("completeFaceIdSetup", () => {
  it("checks the admin before reading the cookie, uses it once, and labels the device", async () => {
    jar.set(REG, "reg-1");
    expect(await actions.completeFaceIdSetup(RESPONSE as never)).toEqual({ ok: true });
    expect(order.indexOf("requireAdmin")).toBeLessThan(order.indexOf(`cookie:get:${REG}`));
    expect(cookieStore.delete).toHaveBeenCalledWith(CLEARED(REG));
    expect(passkeys.finishRegistration).toHaveBeenCalledWith("owner@example.com", "reg-1", RESPONSE, "iPhone");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("reports a failure without storing anything", async () => {
    jar.set(REG, "reg-1");
    passkeys.finishRegistration.mockResolvedValue(false);
    expect(await actions.completeFaceIdSetup(RESPONSE as never)).toEqual({
      error: "Face ID couldn't be turned on. Try again.",
    });
  });

  it("fails without a challenge cookie and never verifies", async () => {
    expect(await actions.completeFaceIdSetup(RESPONSE as never)).toEqual({
      error: "Face ID couldn't be turned on. Try again.",
    });
    expect(passkeys.finishRegistration).not.toHaveBeenCalled();
  });

  it("does nothing when nobody is signed in", async () => {
    jar.set(REG, "reg-1");
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/admin/sign-in"));
    await expect(actions.completeFaceIdSetup(RESPONSE as never)).rejects.toThrow();
    expect(cookieStore.get).not.toHaveBeenCalled();
    expect(passkeys.finishRegistration).not.toHaveBeenCalled();
  });
});

describe("beginFaceIdSignIn", () => {
  it("needs no session and sets the challenge cookie", async () => {
    expect(await actions.beginFaceIdSignIn()).toEqual(OPTIONS);
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(cookieStore.set).toHaveBeenCalledWith(SIGN_IN, "sign-1", COOKIE_OPTIONS);
  });
});

describe("completeFaceIdSignIn", () => {
  it("creates a session for the verified address and opens the Jobs board", async () => {
    jar.set(SIGN_IN, "sign-1");
    await expect(actions.completeFaceIdSignIn(RESPONSE as never)).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(passkeys.finishSignIn).toHaveBeenCalledWith("sign-1", RESPONSE);
    expect(cookieStore.delete).toHaveBeenCalledWith(CLEARED(SIGN_IN));
    expect(createSession).toHaveBeenCalledWith("owner@example.com");
  });

  it("says exactly the same thing for every failure and creates no session", async () => {
    jar.set(SIGN_IN, "sign-1");
    passkeys.finishSignIn.mockResolvedValue({ failed: "not-verified" });
    expect(await actions.completeFaceIdSignIn(RESPONSE as never)).toEqual({ error: FAILED });
    expect(await actions.completeFaceIdSignIn(RESPONSE as never)).toEqual({ error: FAILED });
    expect(createSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("fails without a challenge cookie and never verifies", async () => {
    expect(await actions.completeFaceIdSignIn(RESPONSE as never)).toEqual({ error: FAILED });
    expect(passkeys.finishSignIn).not.toHaveBeenCalled();
  });
});

describe("the two challenge cookies", () => {
  it("are separate, so getting sign-in ready never clobbers a Face ID setup in flight, nor the reverse", async () => {
    await actions.beginFaceIdSetup();
    await actions.beginFaceIdSignIn();
    expect(jar.get(REG)).toBe("reg-1");
    expect(jar.get(SIGN_IN)).toBe("sign-1");

    expect(await actions.completeFaceIdSetup(RESPONSE as never)).toEqual({ ok: true });
    expect(passkeys.finishRegistration).toHaveBeenCalledWith("owner@example.com", "reg-1", RESPONSE, "iPhone");
    expect(jar.get(SIGN_IN)).toBe("sign-1");
    expect(cookieStore.delete).toHaveBeenCalledTimes(1);
    expect(cookieStore.delete).toHaveBeenCalledWith(CLEARED(REG));
  });

  it("are cleared on /admin even when the attempt fails", async () => {
    jar.set(SIGN_IN, "sign-1");
    passkeys.finishSignIn.mockResolvedValue({ failed: "not-verified" });
    await actions.completeFaceIdSignIn(RESPONSE as never);
    expect(cookieStore.delete).toHaveBeenCalledWith(CLEARED(SIGN_IN));
    expect(cookieStore.delete.mock.calls.every(([cookie]) => typeof cookie === "object" && cookie.path === "/admin")).toBe(
      true,
    );
  });
});

describe("beginFaceIdSignIn when too many sign-ins are waiting", () => {
  it("returns nothing and sets no cookie", async () => {
    passkeys.startSignIn.mockResolvedValue(null);
    expect(await actions.beginFaceIdSignIn()).toBeNull();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("completeFaceIdSignIn with a passkey the server no longer knows", () => {
  it("says the same thing, and tells the phone to forget its Face ID marker", async () => {
    jar.set(SIGN_IN, "sign-1");
    passkeys.finishSignIn.mockResolvedValue({ failed: "unknown-passkey" });
    expect(await actions.completeFaceIdSignIn(RESPONSE as never)).toEqual({ error: FAILED, forgetPasskey: true });
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("removeFaceIdDevice", () => {
  it("removes only the signed-in person's own device", async () => {
    await actions.removeFaceIdDevice("cred-1");
    expect(passkeys.removePasskey).toHaveBeenCalledWith("owner@example.com", "cred-1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("checks the admin before removing anything", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/admin/sign-in"));
    await expect(actions.removeFaceIdDevice("cred-1")).rejects.toThrow();
    expect(passkeys.removePasskey).not.toHaveBeenCalled();
  });
});

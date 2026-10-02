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
  delete: vi.fn((name: string) => {
    jar.delete(name);
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
  passkeys.finishSignIn.mockReset().mockResolvedValue("owner@example.com");
  passkeys.removePasskey.mockReset().mockResolvedValue(true);
  cookieStore.get.mockClear();
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  redirect.mockClear();
  revalidatePath.mockClear();
});

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 300, secure: false };

describe("beginFaceIdSetup", () => {
  it("requires a signed-in admin and binds the challenge to their address, in a 5-minute httpOnly cookie", async () => {
    expect(await actions.beginFaceIdSetup()).toEqual(OPTIONS);
    expect(passkeys.startRegistration).toHaveBeenCalledWith("owner@example.com");
    expect(cookieStore.set).toHaveBeenCalledWith("pss_webauthn", "reg-1", COOKIE_OPTIONS);
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
    jar.set("pss_webauthn", "reg-1");
    expect(await actions.completeFaceIdSetup(RESPONSE as never)).toEqual({ ok: true });
    expect(order.indexOf("requireAdmin")).toBeLessThan(order.indexOf("cookie:get:pss_webauthn"));
    expect(cookieStore.delete).toHaveBeenCalledWith("pss_webauthn");
    expect(passkeys.finishRegistration).toHaveBeenCalledWith("owner@example.com", "reg-1", RESPONSE, "iPhone");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("reports a failure without storing anything", async () => {
    jar.set("pss_webauthn", "reg-1");
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
    jar.set("pss_webauthn", "reg-1");
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
    expect(cookieStore.set).toHaveBeenCalledWith("pss_webauthn", "sign-1", COOKIE_OPTIONS);
  });
});

describe("completeFaceIdSignIn", () => {
  it("creates a session for the verified address and opens the Jobs board", async () => {
    jar.set("pss_webauthn", "sign-1");
    await expect(actions.completeFaceIdSignIn(RESPONSE as never)).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(passkeys.finishSignIn).toHaveBeenCalledWith("sign-1", RESPONSE);
    expect(cookieStore.delete).toHaveBeenCalledWith("pss_webauthn");
    expect(createSession).toHaveBeenCalledWith("owner@example.com");
  });

  it("says exactly the same thing for every failure and creates no session", async () => {
    jar.set("pss_webauthn", "sign-1");
    passkeys.finishSignIn.mockResolvedValue(null);
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

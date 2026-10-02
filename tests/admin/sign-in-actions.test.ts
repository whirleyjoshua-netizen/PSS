import { describe, it, expect, vi, beforeEach } from "vitest";

const requestSignIn = vi.fn();
const consumeSignInCode = vi.fn();
const createSession = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error("NEXT_REDIRECT:" + url);
});

vi.mock("@/lib/admin/login", () => ({ requestSignIn, consumeSignInCode }));
vi.mock("@/lib/admin/session", () => ({ createSession }));
vi.mock("next/navigation", () => ({ redirect }));

const { requestSignInAction, verifySignInCodeAction } = await import("@/app/admin/sign-in/actions");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
};

beforeEach(() => {
  requestSignIn.mockReset();
  consumeSignInCode.mockReset();
  createSession.mockReset();
  redirect.mockClear();
});

describe("requestSignInAction", () => {
  it("returns the normalized address so the code form can carry it", async () => {
    expect(await requestSignInAction({ status: "idle" }, form({ email: " Owner@Example.com " })))
      .toEqual({ status: "sent", email: "owner@example.com" });
    expect(requestSignIn).toHaveBeenCalledWith("Owner@Example.com");
  });
});

describe("verifySignInCodeAction", () => {
  it("creates a session and redirects to /admin when the code is good", async () => {
    consumeSignInCode.mockResolvedValue("owner@example.com");
    await expect(verifySignInCodeAction({}, form({ email: "owner@example.com", code: "012345" })))
      .rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(consumeSignInCode).toHaveBeenCalledWith("owner@example.com", "012345");
    expect(createSession).toHaveBeenCalledWith("owner@example.com");
  });

  it("says exactly the same thing for every failure and creates no session", async () => {
    consumeSignInCode.mockResolvedValue(null);
    expect(await verifySignInCodeAction({}, form({ email: "owner@example.com", code: "999999" })))
      .toEqual({ error: "That code didn't work. Check it, or request a new one." });
    expect(await verifySignInCodeAction({}, new FormData()))
      .toEqual({ error: "That code didn't work. Check it, or request a new one." });
    expect(consumeSignInCode).toHaveBeenLastCalledWith("", "");
    expect(createSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

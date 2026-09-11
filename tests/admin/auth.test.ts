import { describe, it, expect, vi, beforeEach } from "vitest";

const consumeSignIn = vi.fn();
const createSession = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error("NEXT_REDIRECT:" + url);
});

vi.mock("@/lib/admin/login", () => ({ consumeSignIn }));
vi.mock("@/lib/admin/session", () => ({ createSession }));
vi.mock("next/navigation", () => ({ redirect }));

const { completeSignIn } = await import("@/app/admin/auth/actions");

function formDataWith(token: string | null) {
  const fd = new FormData();
  if (token !== null) fd.set("token", token);
  return fd;
}

describe("completeSignIn", () => {
  beforeEach(() => {
    consumeSignIn.mockReset();
    createSession.mockReset();
    redirect.mockClear();
  });

  it("redirects to the expired page and never creates a session when the token does not resolve", async () => {
    consumeSignIn.mockResolvedValue(null);
    await expect(completeSignIn(formDataWith("bad-token"))).rejects.toThrow("NEXT_REDIRECT");

    expect(consumeSignIn).toHaveBeenCalledWith("bad-token");
    expect(createSession).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin/sign-in?error=expired");
  });

  it("creates a session and redirects to /admin for a valid token", async () => {
    consumeSignIn.mockResolvedValue("owner@example.com");
    await expect(completeSignIn(formDataWith("good-token"))).rejects.toThrow("NEXT_REDIRECT");

    expect(consumeSignIn).toHaveBeenCalledWith("good-token");
    expect(createSession).toHaveBeenCalledWith("owner@example.com");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("redirects to the expired page without calling consumeSignIn when there is no token", async () => {
    await expect(completeSignIn(formDataWith(null))).rejects.toThrow("NEXT_REDIRECT");

    expect(consumeSignIn).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin/sign-in?error=expired");
  });
});

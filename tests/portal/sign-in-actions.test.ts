import { describe, it, expect, vi, beforeEach } from "vitest";

const login = { requestCustomerSignIn: vi.fn(), consumeCustomerSignIn: vi.fn() };
vi.mock("@/lib/portal/login", () => login);
const session = { createCustomerSession: vi.fn(), destroyCustomerSession: vi.fn() };
vi.mock("@/lib/portal/session", () => session);
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { requestCustomerSignInAction } = await import("@/app/(site)/project/sign-in/actions");
const { completeCustomerSignIn } = await import("@/app/(site)/project/auth/actions");
const { signOutCustomer } = await import("@/app/(site)/project/actions");

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
};

beforeEach(() => {
  Object.values(login).forEach((fn) => fn.mockReset());
  Object.values(session).forEach((fn) => fn.mockReset());
  redirect.mockClear();
});

describe("requestCustomerSignInAction", () => {
  it("rejects a malformed email without doing anything", async () => {
    expect(await requestCustomerSignInAction({ status: "idle" }, form({ email: "nope" })))
      .toEqual({ status: "error", message: "Enter a valid email address" });
    expect(login.requestCustomerSignIn).not.toHaveBeenCalled();
  });

  it("always reports sent for a well-formed email", async () => {
    expect(await requestCustomerSignInAction({ status: "idle" }, form({ email: "maria@example.com" })))
      .toEqual({ status: "sent" });
    expect(login.requestCustomerSignIn).toHaveBeenCalledWith("maria@example.com");
  });
});

describe("completeCustomerSignIn", () => {
  it("starts a session and goes to the project page", async () => {
    login.consumeCustomerSignIn.mockResolvedValue("maria@example.com");
    await expect(completeCustomerSignIn(form({ token: "tok" }))).rejects.toThrow("NEXT_REDIRECT /project");
    expect(session.createCustomerSession).toHaveBeenCalledWith("maria@example.com");
  });

  it("sends an expired or used link back to sign-in", async () => {
    login.consumeCustomerSignIn.mockResolvedValue(null);
    await expect(completeCustomerSignIn(form({ token: "tok" }))).rejects.toThrow("NEXT_REDIRECT /project/sign-in?error=expired");
    expect(session.createCustomerSession).not.toHaveBeenCalled();
  });

  it("treats a missing token as expired", async () => {
    await expect(completeCustomerSignIn(form({}))).rejects.toThrow("/project/sign-in?error=expired");
    expect(login.consumeCustomerSignIn).not.toHaveBeenCalled();
  });
});

describe("signOutCustomer", () => {
  it("ends the session and returns to sign-in", async () => {
    await expect(signOutCustomer()).rejects.toThrow("NEXT_REDIRECT /project/sign-in");
    expect(session.destroyCustomerSession).toHaveBeenCalled();
  });
});

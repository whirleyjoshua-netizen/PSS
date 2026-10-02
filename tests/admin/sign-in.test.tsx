import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const CODE_FAILED = "That code didn't work. Check it, or request a new one.";
const requestSignInAction = vi.fn();
const verifySignInCodeAction = vi.fn();
vi.mock("@/app/admin/sign-in/actions", () => ({ requestSignInAction, verifySignInCodeAction }));

const { SignInForm } = await import("@/app/admin/sign-in/SignInForm");

beforeEach(() => {
  requestSignInAction.mockReset().mockResolvedValue({ status: "sent", email: "owner@example.com" });
  verifySignInCodeAction.mockReset().mockResolvedValue({ error: CODE_FAILED });
});

async function sendFor(user: ReturnType<typeof userEvent.setup>, address = "owner@example.com") {
  await user.type(screen.getByLabelText(/email/i), address);
  await user.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
}

describe("SignInForm", () => {
  it("labels the email field and confirms without revealing access", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await sendFor(user);

    expect(await screen.findByRole("status")).toHaveTextContent(/if that address has access, a sign-in code and link/i);
  });

  it("shows the expired-link message when sent back from a bad link", () => {
    render(<SignInForm expired />);
    expect(screen.getByRole("alert")).toHaveTextContent(/expired or was already used/i);
  });

  it("asks for the code after sending, for the address the server normalized", async () => {
    const user = userEvent.setup();
    const { container } = render(<SignInForm />);
    await sendFor(user, "Owner@Example.com");

    const code = await screen.findByLabelText("6-digit code");
    expect(code).toHaveAttribute("name", "code");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("pattern", "\\d{6}");
    expect(code).toHaveAttribute("maxlength", "6");
    expect(code).toBeRequired();
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="email"]');
    expect(hidden?.value).toBe("owner@example.com");
  });

  it("sends the code and the email to verify, and shows the exact error when it fails", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await sendFor(user);

    await user.type(await screen.findByLabelText("6-digit code"), "012345");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(CODE_FAILED);
    const sent = verifySignInCodeAction.mock.calls[0][1] as FormData;
    expect(sent.get("email")).toBe("owner@example.com");
    expect(sent.get("code")).toBe("012345");
  });

  it("goes back to the email field on \"Use a different email\"", async () => {
    const user = userEvent.setup();
    render(<SignInForm expired />);
    await sendFor(user);

    await user.click(await screen.findByRole("button", { name: /use a different email/i }));

    expect(screen.getByLabelText(/email/i)).toHaveValue("");
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

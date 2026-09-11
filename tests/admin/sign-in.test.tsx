import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const requestSignInAction = vi.fn(async () => ({ status: "sent" as const }));
vi.mock("@/app/admin/sign-in/actions", () => ({ requestSignInAction }));

const { SignInForm } = await import("@/app/admin/sign-in/SignInForm");

describe("SignInForm", () => {
  it("labels the email field and confirms without revealing access", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /email me a sign-in link/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/if that address has access/i);
  });

  it("shows the expired-link message when sent back from a bad link", () => {
    render(<SignInForm expired />);
    expect(screen.getByRole("alert")).toHaveTextContent(/expired or was already used/i);
  });
});

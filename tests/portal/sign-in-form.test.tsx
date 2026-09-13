import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(site)/project/sign-in/actions", () => ({ requestCustomerSignInAction: vi.fn() }));
const { CustomerSignInForm } = await import("@/app/(site)/project/sign-in/SignInForm");

describe("CustomerSignInForm", () => {
  it("asks for an email", () => {
    render(<CustomerSignInForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeInTheDocument();
  });

  it("explains an expired link", () => {
    render(<CustomerSignInForm expired />);
    expect(screen.getByRole("alert")).toHaveTextContent("This link expired or was already used");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const FAILED = "Face ID sign-in didn't work. Try again, or use the email code.";
const browser = {
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(),
};
vi.mock("@simplewebauthn/browser", () => browser);
const beginFaceIdSignIn = vi.fn();
const completeFaceIdSignIn = vi.fn();
vi.mock("@/app/admin/passkey-actions", () => ({ beginFaceIdSignIn, completeFaceIdSignIn }));

const { PasskeySignIn } = await import("@/app/admin/PasskeySignIn");

const OPTIONS = { challenge: "abc", rpId: "example.com" };
const RESPONSE = { id: "cred-1" };
const named = (name: string) => Object.assign(new Error(name), { name });

beforeEach(() => {
  browser.browserSupportsWebAuthn.mockReset().mockReturnValue(true);
  browser.startAuthentication.mockReset().mockResolvedValue(RESPONSE);
  beginFaceIdSignIn.mockReset().mockResolvedValue(OPTIONS);
  completeFaceIdSignIn.mockReset().mockResolvedValue({ error: FAILED });
});

describe("PasskeySignIn", () => {
  it("shows nothing when this browser has no passkeys", () => {
    browser.browserSupportsWebAuthn.mockReturnValue(false);
    const { container } = render(<PasskeySignIn />);
    expect(container).toBeEmptyDOMElement();
  });

  it("leads with Sign in with Face ID, above a divider to the email form", () => {
    render(<PasskeySignIn />);
    expect(screen.getByRole("button", { name: "Sign in with Face ID" })).toBeEnabled();
    expect(screen.getByText("or use your email")).toBeInTheDocument();
  });

  it("asks the phone for a passkey with the server's options, then sends its answer back", async () => {
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await user.click(screen.getByRole("button", { name: "Sign in with Face ID" }));

    await waitFor(() => expect(completeFaceIdSignIn).toHaveBeenCalledWith(RESPONSE));
    expect(beginFaceIdSignIn).toHaveBeenCalled();
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
  });

  it("shows the server's failure exactly", async () => {
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await user.click(screen.getByRole("button", { name: "Sign in with Face ID" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
  });

  it("says nothing alarming when the person cancels the Face ID sheet", async () => {
    browser.startAuthentication.mockRejectedValue(named("NotAllowedError"));
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await user.click(screen.getByRole("button", { name: "Sign in with Face ID" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in with Face ID" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(completeFaceIdSignIn).not.toHaveBeenCalled();
  });

  it("shows the failure for any other error on the phone", async () => {
    browser.startAuthentication.mockRejectedValue(named("SecurityError"));
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await user.click(screen.getByRole("button", { name: "Sign in with Face ID" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    expect(completeFaceIdSignIn).not.toHaveBeenCalled();
  });
});

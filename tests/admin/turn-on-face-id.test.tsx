import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const browser = {
  browserSupportsWebAuthn: vi.fn(() => true),
  platformAuthenticatorIsAvailable: vi.fn(async () => true),
  startRegistration: vi.fn(),
};
vi.mock("@simplewebauthn/browser", () => browser);
const beginFaceIdSetup = vi.fn();
const completeFaceIdSetup = vi.fn();
vi.mock("@/app/admin/passkey-actions", () => ({ beginFaceIdSetup, completeFaceIdSetup }));

const { TurnOnFaceId } = await import("@/app/admin/TurnOnFaceId");

const OPTIONS = { challenge: "abc" };
const RESPONSE = { id: "cred-1" };
const named = (name: string) => Object.assign(new Error(name), { name });
const PHONE_BUTTON = { name: "Turn on Face ID for this phone" };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  browser.browserSupportsWebAuthn.mockReset().mockReturnValue(true);
  browser.platformAuthenticatorIsAvailable.mockReset().mockResolvedValue(true);
  browser.startRegistration.mockReset().mockResolvedValue(RESPONSE);
  beginFaceIdSetup.mockReset().mockResolvedValue(OPTIONS);
  completeFaceIdSetup.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("TurnOnFaceId on the Jobs board", () => {
  it("offers Face ID when this phone can do it and has not turned it on", async () => {
    render(<TurnOnFaceId place="board" />);
    expect(await screen.findByRole("button", PHONE_BUTTON)).toBeEnabled();
  });

  it("stays hidden when the browser has no passkeys, or no Face ID / Touch ID", async () => {
    browser.browserSupportsWebAuthn.mockReturnValue(false);
    const first = render(<TurnOnFaceId place="board" />);
    first.unmount();
    browser.browserSupportsWebAuthn.mockReturnValue(true);
    browser.platformAuthenticatorIsAvailable.mockResolvedValue(false);
    render(<TurnOnFaceId place="board" />);
    await waitFor(() => expect(browser.platformAuthenticatorIsAvailable).toHaveBeenCalled());
    expect(screen.queryByRole("button", PHONE_BUTTON)).not.toBeInTheDocument();
  });

  it("stays hidden once this phone has turned it on", async () => {
    localStorage.setItem("pss_passkey", "1");
    render(<TurnOnFaceId place="board" />);
    // Settle any pending check before asserting the card never appeared.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button", PHONE_BUTTON)).not.toBeInTheDocument();
    expect(browser.platformAuthenticatorIsAvailable).not.toHaveBeenCalled();
  });

  it("registers a passkey, marks this phone, and says so", async () => {
    const user = userEvent.setup();
    render(<TurnOnFaceId place="board" />);
    await user.click(await screen.findByRole("button", PHONE_BUTTON));

    expect(await screen.findByRole("status")).toHaveTextContent("Face ID is on for this phone");
    expect(browser.startRegistration).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
    expect(completeFaceIdSetup).toHaveBeenCalledWith(RESPONSE);
    expect(localStorage.getItem("pss_passkey")).toBe("1");
  });

  it("shows the server's error and leaves the phone unmarked", async () => {
    completeFaceIdSetup.mockResolvedValue({ error: "Face ID couldn't be turned on. Try again." });
    const user = userEvent.setup();
    render(<TurnOnFaceId place="board" />);
    await user.click(await screen.findByRole("button", PHONE_BUTTON));

    expect(await screen.findByRole("alert")).toHaveTextContent("Face ID couldn't be turned on. Try again.");
    expect(localStorage.getItem("pss_passkey")).toBeNull();
  });

  it("stays quiet when the person cancels the Face ID sheet", async () => {
    browser.startRegistration.mockRejectedValue(named("NotAllowedError"));
    const user = userEvent.setup();
    render(<TurnOnFaceId place="board" />);
    await user.click(await screen.findByRole("button", PHONE_BUTTON));

    await waitFor(() => expect(screen.getByRole("button", PHONE_BUTTON)).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(completeFaceIdSetup).not.toHaveBeenCalled();
  });

  it("treats a phone that already has a passkey here as on", async () => {
    browser.startRegistration.mockRejectedValue(named("InvalidStateError"));
    const user = userEvent.setup();
    render(<TurnOnFaceId place="board" />);
    await user.click(await screen.findByRole("button", PHONE_BUTTON));

    expect(await screen.findByRole("status")).toHaveTextContent("Face ID is on for this phone");
    expect(localStorage.getItem("pss_passkey")).toBe("1");
  });

  it("hides for this session on Not now", async () => {
    const user = userEvent.setup();
    const first = render(<TurnOnFaceId place="board" />);
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("button", PHONE_BUTTON)).not.toBeInTheDocument();
    first.unmount();

    browser.platformAuthenticatorIsAvailable.mockClear();
    render(<TurnOnFaceId place="board" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button", PHONE_BUTTON)).not.toBeInTheDocument();
    expect(browser.platformAuthenticatorIsAvailable).not.toHaveBeenCalled();
  });

  it("still offers Face ID when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<TurnOnFaceId place="board" />);
    await user.click(await screen.findByRole("button", PHONE_BUTTON));
    expect(await screen.findByRole("status")).toHaveTextContent("Face ID is on for this phone");
  });
});

describe("TurnOnFaceId in Settings", () => {
  it("offers it for this device even when this phone was marked, with no Not now", async () => {
    localStorage.setItem("pss_passkey", "1");
    render(<TurnOnFaceId place="settings" />);
    expect(await screen.findByRole("button", { name: "Turn on Face ID for this device" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Not now" })).not.toBeInTheDocument();
  });

  it("confirms for this device", async () => {
    const user = userEvent.setup();
    render(<TurnOnFaceId place="settings" />);
    await user.click(await screen.findByRole("button", { name: "Turn on Face ID for this device" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Face ID is on for this device");
  });
});

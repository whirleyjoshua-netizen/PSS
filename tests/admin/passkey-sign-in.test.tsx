import { Component, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const FAILED = "Face ID sign-in didn't work. Try again, or use the email code.";
const browser = {
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(),
};
vi.mock("@simplewebauthn/browser", () => browser);
const beginFaceIdSignIn = vi.fn();
const completeFaceIdSignIn = vi.fn();
vi.mock("@/app/admin/passkey-actions", () => ({ beginFaceIdSignIn, completeFaceIdSignIn }));
// The real redirect error and unstable_rethrow, not the shared setup's router-only stub.
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()) }));

const { PasskeySignIn } = await import("@/app/admin/PasskeySignIn");
const { redirect } = await import("next/navigation");

const OPTIONS = { challenge: "abc", rpId: "example.com" };
const FRESH = { challenge: "def", rpId: "example.com" };
const RESPONSE = { id: "cred-1" };
const BUTTON = { name: "Sign in with Face ID" };
const FOUR_MINUTES = 4 * 60 * 1000;
const named = (name: string) => Object.assign(new Error(name), { name });
const never = () => new Promise<never>(() => {});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const ready = () => waitFor(() => expect(screen.getByRole("button", BUTTON)).toBeEnabled());
const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  localStorage.clear();
  browser.browserSupportsWebAuthn.mockReset().mockReturnValue(true);
  browser.startAuthentication.mockReset().mockResolvedValue(RESPONSE);
  beginFaceIdSignIn.mockReset().mockResolvedValue(OPTIONS);
  completeFaceIdSignIn.mockReset().mockResolvedValue({ error: FAILED });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

describe("PasskeySignIn", () => {
  it("shows nothing when this browser has no passkeys, and fetches nothing", async () => {
    browser.browserSupportsWebAuthn.mockReturnValue(false);
    const { container } = render(<PasskeySignIn />);
    expect(container).toBeEmptyDOMElement();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(beginFaceIdSignIn).not.toHaveBeenCalled();
  });

  it("gets the server's options ready as soon as it shows, and keeps the button off until then", async () => {
    const options = deferred<typeof OPTIONS>();
    beginFaceIdSignIn.mockReturnValue(options.promise);
    render(<PasskeySignIn />);
    expect(screen.getByRole("button", BUTTON)).toBeDisabled();
    expect(screen.getByText("or use your email")).toBeInTheDocument();
    await waitFor(() => expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1));

    await act(async () => options.resolve(OPTIONS));
    expect(screen.getByRole("button", BUTTON)).toBeEnabled();
  });

  it("asks the phone for a passkey inside the tap itself, before anything is awaited", async () => {
    render(<PasskeySignIn />);
    await ready();
    // Any further fetch would hang: the tap must not need one.
    beginFaceIdSignIn.mockImplementation(never);

    fireEvent.click(screen.getByRole("button", BUTTON));
    // Same tick as the tap: iPhone Safari refuses a passkey sheet after an await.
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(completeFaceIdSignIn).toHaveBeenCalledWith(RESPONSE));
  });

  it("never uses one set of options twice: after a try it fetches fresh ones and uses those", async () => {
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await ready();
    beginFaceIdSignIn.mockResolvedValue(FRESH);

    await user.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    await waitFor(() => expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2));
    await ready();

    await user.click(screen.getByRole("button", BUTTON));
    expect(browser.startAuthentication).toHaveBeenNthCalledWith(2, { optionsJSON: FRESH });
  });

  it("keeps the button off from the tap until fresh options arrive", async () => {
    render(<PasskeySignIn />);
    await ready();
    const attempt = deferred<typeof RESPONSE>();
    browser.startAuthentication.mockReturnValue(attempt.promise);
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    // The attempt's challenge cookie is still in use, so nothing new is fetched yet.
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
    await act(async () => attempt.resolve(RESPONSE));
    await ready();
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2);
  });

  it("fetches fresh options after about 4 minutes on screen", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    render(<PasskeySignIn />);
    await act(async () => {});
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(FOUR_MINUTES - 1000));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
    beginFaceIdSignIn.mockResolvedValue(FRESH);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2);
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: FRESH });
  });

  it("on return to the app, fetches fresh options only when the ones it holds are about 4 minutes old", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    render(<PasskeySignIn />);
    await ready();

    now += FOUR_MINUTES - 1000;
    act(() => setVisibility("visible"));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);

    now += 1000;
    act(() => setVisibility("hidden"));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
    beginFaceIdSignIn.mockResolvedValue(FRESH);
    act(() => setVisibility("visible"));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2);
    await ready();

    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: FRESH });
  });

  it("never shows the failure before any tap when options cannot be fetched, and keeps the button on", async () => {
    beginFaceIdSignIn.mockResolvedValue(null);
    render(<PasskeySignIn />);
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("a tap while options are missing asks for them again and says so, without starting a sign-in", async () => {
    beginFaceIdSignIn.mockResolvedValue(null);
    render(<PasskeySignIn />);
    await ready();
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
    const options = deferred<typeof OPTIONS>();
    beginFaceIdSignIn.mockReturnValue(options.promise);

    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(browser.startAuthentication).not.toHaveBeenCalled();
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Getting Face ID ready…");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => options.resolve(OPTIONS));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // The passkey sheet comes on the next tap, inside that tap.
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
  });

  it("ignores further taps while it is getting ready, so no second request starts", async () => {
    beginFaceIdSignIn.mockResolvedValue(null);
    render(<PasskeySignIn />);
    await ready();
    const options = deferred<typeof OPTIONS>();
    beginFaceIdSignIn.mockReturnValue(options.promise);

    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", BUTTON));
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2);
    expect(browser.startAuthentication).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Getting Face ID ready…");

    await act(async () => options.resolve(OPTIONS));
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
  });

  it("after a failed fetch tries again by itself at 2s, 5s, 15s, then every 30s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    beginFaceIdSignIn.mockResolvedValue(null);
    render(<PasskeySignIn />);
    await act(async () => {});
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
    let calls = 1;
    for (const wait of [2000, 5000, 15000, 30000, 30000, 30000]) {
      await act(async () => vi.advanceTimersByTime(wait - 1));
      expect(beginFaceIdSignIn).toHaveBeenCalledTimes(calls);
      await act(async () => vi.advanceTimersByTime(1));
      expect(beginFaceIdSignIn).toHaveBeenCalledTimes(++calls);
    }

    // Once options land, the retries stop: next comes the 4-minute refresh.
    beginFaceIdSignIn.mockResolvedValue(OPTIONS);
    await act(async () => vi.advanceTimersByTime(30000));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(++calls);
    expect(screen.getByRole("button", BUTTON)).toBeEnabled();
    await act(async () => vi.advanceTimersByTime(FOUR_MINUTES - 1000));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(calls);
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: OPTIONS });
  });

  it("waits for the page to be on screen before retrying, and retries on return", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    beginFaceIdSignIn.mockResolvedValue(null);
    render(<PasskeySignIn />);
    await act(async () => {});
    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);

    beginFaceIdSignIn.mockResolvedValue(OPTIONS);
    await act(async () => setVisibility("visible"));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", BUTTON)).toBeEnabled();
  });

  it("stops retrying once gone from the screen", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    beginFaceIdSignIn.mockResolvedValue(null);
    const { unmount } = render(<PasskeySignIn />);
    await act(async () => {});
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
  });

  it("shows the server's failure exactly", async () => {
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await ready();
    await user.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
  });

  it("shows the failure when sending the answer throws, and stays usable", async () => {
    completeFaceIdSignIn.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await ready();
    await user.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    await ready();
  });

  it("lets the sign-in redirect through to the router instead of showing a failure", async () => {
    let redirectError: unknown;
    try {
      redirect("/admin");
    } catch (error) {
      redirectError = error;
    }
    completeFaceIdSignIn.mockRejectedValue(redirectError);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const caught: unknown[] = [];
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error: unknown) {
        caught.push(error);
      }
      render() {
        return this.state.failed ? <p>redirected</p> : this.props.children;
      }
    }
    const user = userEvent.setup();
    render(
      <Boundary>
        <PasskeySignIn />
      </Boundary>,
    );
    await ready();
    await user.click(screen.getByRole("button", BUTTON));

    expect(await screen.findByText("redirected")).toBeInTheDocument();
    expect(caught).toEqual([redirectError]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Signed in: no fresh sign-in is started behind the redirect.
    expect(beginFaceIdSignIn).toHaveBeenCalledTimes(1);
  });

  it("forgets this phone's Face ID marker when the server no longer knows its passkey", async () => {
    localStorage.setItem("pss_passkey", "1");
    completeFaceIdSignIn.mockResolvedValue({ error: FAILED, forgetPasskey: true });
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await ready();
    await user.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    expect(localStorage.getItem("pss_passkey")).toBeNull();
  });

  it("keeps the marker for any other failure, and survives blocked storage", async () => {
    localStorage.setItem("pss_passkey", "1");
    const user = userEvent.setup();
    const first = render(<PasskeySignIn />);
    await ready();
    await user.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    expect(localStorage.getItem("pss_passkey")).toBe("1");
    first.unmount();

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    completeFaceIdSignIn.mockResolvedValue({ error: FAILED, forgetPasskey: true });
    render(<PasskeySignIn />);
    await ready();
    await user.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
  });

  it("says nothing alarming when the person cancels the Face ID sheet, and is ready again", async () => {
    browser.startAuthentication.mockRejectedValue(named("NotAllowedError"));
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await ready();
    await user.click(screen.getByRole("button", BUTTON));

    await waitFor(() => expect(beginFaceIdSignIn).toHaveBeenCalledTimes(2));
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(completeFaceIdSignIn).not.toHaveBeenCalled();
  });

  it("shows the failure for any other error on the phone", async () => {
    browser.startAuthentication.mockRejectedValue(named("SecurityError"));
    const user = userEvent.setup();
    render(<PasskeySignIn />);
    await ready();
    await user.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    expect(completeFaceIdSignIn).not.toHaveBeenCalled();
  });
});

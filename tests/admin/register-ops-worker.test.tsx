import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { RegisterOpsWorker } from "@/app/admin/RegisterOpsWorker";

afterEach(() => {
  // jsdom has no serviceWorker; remove the stub so other tests see the real navigator.
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.restoreAllMocks();
});

describe("RegisterOpsWorker", () => {
  it("registers /ops-sw.js for the whole admin, start page included, and renders nothing", () => {
    const register = vi.fn(async () => ({}));
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    const { container } = render(<RegisterOpsWorker />);
    expect(register).toHaveBeenCalledWith("/ops-sw.js", { scope: "/admin" });
    expect(container).toBeEmptyDOMElement();
  });

  it("only warns when registration fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const register = vi.fn(async () => {
      throw new Error("blocked");
    });
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    render(<RegisterOpsWorker />);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });

  it("does nothing where service workers aren't supported", () => {
    expect("serviceWorker" in navigator).toBe(false);
    const { container } = render(<RegisterOpsWorker />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { act } from "react";
import { render, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Confetti } from "@/app/(site)/thank-you/all-set/Confetti";

const mockMatchMedia = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Confetti", () => {
  it("renders an aria-hidden canvas but starts no animation under reduced motion", () => {
    mockMatchMedia(true);
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    const { container } = render(<Confetti />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("renders an aria-hidden canvas otherwise", () => {
    mockMatchMedia(false);
    const { container } = render(<Confetti />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("does not throw when getContext returns null", () => {
    mockMatchMedia(false);
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
    expect(() => render(<Confetti />)).not.toThrow();
    HTMLCanvasElement.prototype.getContext = original;
  });

  it("hydrates cleanly under reduced motion with no mismatch", () => {
    mockMatchMedia(true);
    const html = renderToString(<Confetti />);
    expect(html).toContain("<canvas");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot> | null = null;
    act(() => {
      root = hydrateRoot(container, <Confetti />);
    });

    const hydrationErrors = errorSpy.mock.calls.filter(([message]) =>
      typeof message === "string" && /hydrat|mismatch/i.test(message),
    );
    expect(hydrationErrors).toHaveLength(0);

    act(() => {
      root?.unmount();
    });
    errorSpy.mockRestore();
    document.body.removeChild(container);
  });
});

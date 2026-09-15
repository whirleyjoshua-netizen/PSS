import { render, cleanup } from "@testing-library/react";
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
  it("renders nothing under reduced motion", () => {
    mockMatchMedia(true);
    const { container } = render(<Confetti />);
    expect(container.querySelector("canvas")).toBeNull();
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
});

import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Hero } from "@/components/home/Hero";

const at = (iso: string) => vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date(iso));

describe("the hero's holiday dressing", () => {
  afterEach(() => vi.useRealTimers());

  it("snows, hangs a garland and wishes happy holidays during the season", () => {
    at("2026-12-01T19:00:00Z");
    const { container } = render(<Hero />);

    expect(screen.getByText(/happy holidays from our family to yours/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".hero-snow-fall").length).toBeGreaterThanOrEqual(20);
    expect(container.querySelectorAll(".garland-light").length).toBeGreaterThan(0);
  });

  it("keeps the snow and garland out of the way of screen readers and clicks", () => {
    at("2026-12-01T19:00:00Z");
    const { container } = render(<Hero />);

    for (const decor of container.querySelectorAll("[data-holiday-snow], [data-holiday-garland]")) {
      expect(decor.getAttribute("aria-hidden")).toBe("true");
      expect(decor.className).toContain("pointer-events-none");
    }
    expect(container.querySelectorAll("[data-holiday-snow], [data-holiday-garland]")).toHaveLength(2);
  });

  it("marks every holiday piece so the season script can take it down on time", () => {
    at("2026-12-01T19:00:00Z");
    const { container } = render(<Hero />);

    expect(container.querySelectorAll("[data-holiday-decor]")).toHaveLength(3);
    expect(container.querySelector("script")?.textContent).toContain("[data-holiday-decor]");
  });

  it("puts nothing holiday on a page built after Christmas Eve", () => {
    at("2026-12-25T08:00:00Z");
    const { container } = render(<Hero />);

    expect(screen.queryByText(/happy holidays/i)).not.toBeInTheDocument();
    expect(container.querySelector("[data-holiday-decor]")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("draws the same sky every render, so the page never jumps on load", () => {
    at("2026-12-01T19:00:00Z");
    const first = render(<Hero />).container.querySelector("[data-holiday-snow]")!.innerHTML;
    const second = render(<Hero />).container.querySelector("[data-holiday-snow]")!.innerHTML;
    expect(second).toBe(first);
  });
});

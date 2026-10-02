import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PromoBannerClient } from "@/components/layout/PromoBannerClient";
import { PromoBanner } from "@/components/layout/PromoBanner";
import { promoStorageKey } from "@/lib/promo";
import { holidayPromo } from "@/content/promo";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/events", () => ({ trackPromoClick: track }));

beforeEach(() => {
  nav.pathname = "/";
  track.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PromoBannerClient", () => {
  it("links the holiday message to the consultation form", () => {
    render(<PromoBannerClient promo={holidayPromo} />);
    const link = screen.getByRole("link", { name: /holidays are coming/i });
    expect(link.getAttribute("href")).toBe("/contact");
  });

  it("carries the promo id the early script hides by", () => {
    const { container } = render(<PromoBannerClient promo={holidayPromo} />);
    expect(container.querySelector(`[data-promo="${holidayPromo.id}"]`)).not.toBeNull();
  });

  it("closes, and remembers the close for this promo", async () => {
    const user = userEvent.setup();
    render(<PromoBannerClient promo={holidayPromo} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("link", { name: /holidays are coming/i })).toBeNull();
    expect(window.localStorage.getItem(promoStorageKey(holidayPromo))).toBe("1");
  });

  it("still closes when storage is blocked", async () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      const user = userEvent.setup();
      render(<PromoBannerClient promo={holidayPromo} />);
      await user.click(screen.getByRole("button", { name: /close/i }));
      expect(screen.queryByRole("link", { name: /holidays are coming/i })).toBeNull();
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it("counts a click on the message", async () => {
    const user = userEvent.setup();
    render(<PromoBannerClient promo={holidayPromo} />);
    await user.click(screen.getByRole("link", { name: /holidays are coming/i }));
    expect(track).toHaveBeenCalledWith(holidayPromo.id, "/");
  });

  it.each(["/project", "/project/abc", "/thank-you", "/thank-you/all-set"])("stays off %s", (path) => {
    nav.pathname = path;
    const { container } = render(<PromoBannerClient promo={holidayPromo} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("PromoBanner", () => {
  it("renders the banner and its early script inside the window", () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T12:00:00Z"), toFake: ["Date"] });
    const { container } = render(<PromoBanner />);
    expect(container.querySelector("script")).not.toBeNull();
    expect(screen.getByRole("link", { name: /holidays are coming/i })).toBeInTheDocument();
  });

  it("renders nothing when built after the end", () => {
    vi.useFakeTimers({ now: new Date("2026-12-25T08:00:00Z"), toFake: ["Date"] });
    const { container } = render(<PromoBanner />);
    expect(container.innerHTML).toBe("");
  });
});

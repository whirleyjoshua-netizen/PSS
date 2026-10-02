import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PromoBannerClient } from "@/components/layout/PromoBannerClient";
import { PromoBanner } from "@/components/layout/PromoBanner";
import { promoStorageKey } from "@/lib/promo";
import { holidayPromo } from "@/content/promo";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const track = vi.hoisted(() => vi.fn());
const trackLeadTimes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/events", () => ({ trackPromoClick: track, trackLeadTimesOpen: trackLeadTimes }));

beforeEach(() => {
  nav.pathname = "/";
  track.mockReset();
  trackLeadTimes.mockReset();
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

describe("the lead-times dropdown", () => {
  const open = async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PromoBannerClient promo={holidayPromo} />);
    const button = screen.getByRole("button", { name: /lead times/i });
    await user.click(button);
    return { user, button };
  };

  beforeEach(() => {
    // Oct 2, 11am in Las Vegas.
    vi.useFakeTimers({ now: new Date("2026-10-02T18:00:00Z"), toFake: ["Date"] });
  });

  it("starts closed, so the prerendered page carries no dates", () => {
    render(<PromoBannerClient promo={holidayPromo} />);
    const button = screen.getByRole("button", { name: /lead times/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lists each product's weeks and install window from today", async () => {
    const { button } = await open();
    expect(button).toHaveAttribute("aria-expanded", "true");
    const table = screen.getByRole("table", { name: /current lead times/i });
    const shutters = within(table).getByRole("row", { name: /shutters/i });
    expect(shutters).toHaveTextContent("6–10 weeks");
    expect(shutters).toHaveTextContent("Nov 13 – Dec 11");
    expect(within(table).getByRole("row", { name: /blinds/i })).toHaveTextContent("Oct 23 – Nov 6");
    expect(screen.getByText(/counted from your consult, when you order/i)).toBeInTheDocument();
  });

  it("says when a window may run past Christmas", async () => {
    vi.setSystemTime(new Date("2026-11-01T18:00:00Z"));
    await open();
    const table = screen.getByRole("table", { name: /current lead times/i });
    expect(within(table).getByRole("row", { name: /shutters/i })).toHaveTextContent(/may be after christmas/i);
    expect(within(table).getByRole("row", { name: /blinds/i })).not.toHaveTextContent(/christmas/i);
  });

  it("closes on Escape and hands focus back to the button", async () => {
    const { user, button } = await open();
    screen.getByRole("link", { name: /book your free consult/i }).focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("table")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("closes on a tap outside it", async () => {
    const { user } = await open();
    await user.click(document.body);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("stays open on a tap inside it", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("table"));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("counts an open", async () => {
    await open();
    expect(trackLeadTimes).toHaveBeenCalledWith(holidayPromo.id, "/");
  });

  it("offers the consult from the panel", async () => {
    await open();
    const link = screen.getByRole("link", { name: /book your free consult/i });
    expect(link.getAttribute("href")).toBe("/contact");
  });
});

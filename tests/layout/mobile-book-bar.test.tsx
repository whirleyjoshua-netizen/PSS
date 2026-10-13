import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
const { sendGAEvent } = vi.hoisted(() => ({ sendGAEvent: vi.fn() }));
vi.mock("@next/third-parties/google", () => ({ sendGAEvent }));

import { readFileSync } from "node:fs";
import path from "node:path";
import { BAR_HEIGHT, MobileBookBar, showsBookBar } from "@/components/layout/MobileBookBar";
import { PhoneClickTracking } from "@/components/analytics/PhoneClickTracking";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { business } from "@/content/business";

const at = (path: string, page?: React.ReactNode) => {
  pathname = path;
  return render(
    <>
      {page}
      <MobileBookBar />
    </>,
  );
};
const bar = () => screen.queryByRole("navigation", { name: "Book a consultation" });

beforeEach(() => {
  pathname = "/";
  sendGAEvent.mockClear();
});

describe("which pages carry the bar", () => {
  it("hides on pages that are already the booking step, or past it", () => {
    for (const path of ["/contact", "/thank-you", "/thank-you/service", "/project", "/project/abc123"]) {
      expect(showsBookBar(path), path).toBe(false);
    }
  });

  it("shows everywhere else on the public site, the holiday page included (it has no sticky button of its own)", () => {
    for (const path of ["/", "/shades", "/shutters/plantation-shutters", "/service-area/henderson", "/holiday", "/consultation", "/about", "/contacts", "/projects"]) {
      expect(showsBookBar(path), path).toBe(true);
    }
  });

  it("renders nothing on a hidden page", () => {
    const { container } = at("/contact");
    expect(bar()).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});

describe("the bar", () => {
  it("is fixed to the bottom on phones only, inside the safe area, with two tall buttons", () => {
    at("/");
    const nav = bar()!;
    expect(nav.className).toMatch(/\bfixed\b/);
    expect(nav.className).toMatch(/\binset-x-0\b/);
    expect(nav.className).toMatch(/\bbottom-0\b/);
    expect(nav.className).toMatch(/\bmd:hidden\b/);
    expect(nav.className).toContain("env(safe-area-inset-bottom)");
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.className).toMatch(/\bmin-h-12\b/);
  });

  it("calls our number", () => {
    at("/");
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", business.phone.href);
  });

  it("sends Invite Us Over to /contact when the page has no booking form", () => {
    at("/about");
    const link = screen.getByRole("link", { name: "Invite Us Over" });
    expect(link).toHaveAttribute("href", "/contact");
    expect(fireEvent.click(link)).toBe(true); // not prevented: the link goes to /contact
  });

  it("scrolls to the page's own booking form instead, when there is one", () => {
    at("/shades", <section id="book" />);
    const form = document.getElementById("book")!;
    const scrollIntoView = vi.fn();
    form.scrollIntoView = scrollIntoView;
    const link = screen.getByRole("link", { name: "Invite Us Over" });
    expect(fireEvent.click(link)).toBe(false); // prevented: no trip to /contact
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("#book");
  });

  it("moves focus to the form's first field without a second, jumping scroll", () => {
    at(
      "/shades",
      <section id="book">
        <input type="hidden" name="source" />
        <input aria-label="Name" />
        <input aria-label="Phone" />
      </section>,
    );
    const form = document.getElementById("book")!;
    form.scrollIntoView = vi.fn();
    const name = screen.getByLabelText("Name");
    const focus = vi.spyOn(name, "focus");
    fireEvent.click(screen.getByRole("link", { name: "Invite Us Over" }));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(name);
  });

  it.each([
    ["Cmd", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["middle-button", { button: 1 }],
  ])("leaves a %s click to the browser, so a new tab still opens /contact", (_name, init) => {
    at("/shades", <section id="book" />);
    const form = document.getElementById("book")!;
    const scrollIntoView = vi.fn();
    form.scrollIntoView = scrollIntoView;
    const link = screen.getByRole("link", { name: "Invite Us Over" });
    expect(fireEvent.click(link, init)).toBe(true); // not prevented
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("holds open a phone-height space after the footer, so the bar never covers the last of the page", () => {
    const { container } = at("/");
    const spacer = container.querySelector("[data-book-bar-spacer]")!;
    expect(spacer.getAttribute("aria-hidden")).toBe("true");
    expect(spacer.className).toMatch(/\bmd:hidden\b/);
    expect(spacer.compareDocumentPosition(bar()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The spacer is exactly the bar's height: both take it from one CSS variable.
    expect(BAR_HEIGHT).toBe("h-(--book-bar-height)");
    expect(spacer.className.split(/\s+/)).toContain(BAR_HEIGHT);
    expect(bar()!.className.split(/\s+/)).toContain(BAR_HEIGHT);
  });

  it("is 4rem plus the safe area, and phones keep focused fields above it with scroll-padding", () => {
    const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain("--book-bar-height: calc(4rem + env(safe-area-inset-bottom));");
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*html \{\s*scroll-padding-bottom: var\(--book-bar-height\);/);
    // 4rem = the 1px rule and top padding (0.5rem together) + 3rem buttons + 0.5rem bottom padding.
    at("/");
    const nav = bar()!;
    expect(nav.className).toContain("pt-[calc(0.5rem-1px)]");
    expect(nav.className).toContain("pb-[calc(0.5rem+env(safe-area-inset-bottom))]");
    expect(nav.className).toMatch(/\bborder-t\b/);
    for (const link of nav.querySelectorAll("a")) expect(link.className).toMatch(/\bmin-h-12\b/);
  });

  it("counts a tap on Call as a phone click, through the site's one document listener", async () => {
    pathname = "/shades";
    window.history.pushState({}, "", "/shades");
    render(
      <>
        <MobileBookBar />
        <PhoneClickTracking />
      </>,
    );
    const call = screen.getByRole("link", { name: "Call" });
    call.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(call);
    expect(sendGAEvent).toHaveBeenCalledWith("event", "phone_click", { page: "/shades" });
  });
});

describe("SiteChrome", () => {
  it("renders the bar after the footer on every public page", () => {
    pathname = "/";
    render(<SiteChrome>page</SiteChrome>);
    const footer = screen.getByRole("contentinfo");
    expect(footer.compareDocumentPosition(bar()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

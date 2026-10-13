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

import { MobileBookBar, showsBookBar } from "@/components/layout/MobileBookBar";
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

  it("holds open a phone-height space after the footer, so the bar never covers the last of the page", () => {
    const { container } = at("/");
    const spacer = container.querySelector("[data-book-bar-spacer]")!;
    expect(spacer.getAttribute("aria-hidden")).toBe("true");
    expect(spacer.className).toMatch(/\bmd:hidden\b/);
    expect(spacer.compareDocumentPosition(bar()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

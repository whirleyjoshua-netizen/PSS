import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import Link from "next/link";
import { NavDisclosure } from "@/components/layout/NavDisclosure";

function Menu() {
  return (
    <>
      <ul>
        <NavDisclosure label="Shades" className="" panelClassName="left-0">
          <ul aria-label="Shades">
            <li>
              <Link href="/shades">All shades</Link>
            </li>
            <li>
              <Link href="/shades/solar-shades">Solar Shades</Link>
            </li>
          </ul>
        </NavDisclosure>
      </ul>
      <button type="button">Elsewhere</button>
    </>
  );
}

const toggle = () => screen.getByRole("button", { name: "Shades" });
const panel = () => document.getElementById(toggle().getAttribute("aria-controls")!)!;

beforeEach(() => {
  pathname = "/";
});

describe("NavDisclosure", () => {
  it("is a button that controls a panel hidden while closed", () => {
    render(<Menu />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeVisible();
    expect(screen.queryByRole("link", { name: "Solar Shades" })).toBeNull();
  });

  it("toggles on click, and puts its links in the accessibility tree while open", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(panel()).toBeVisible();
    expect(screen.getByRole("link", { name: "Solar Shades" })).toHaveAttribute("href", "/shades/solar-shades");
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens with Enter and with Space", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    toggle().focus();
    await user.keyboard("{Enter}");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape from inside the panel and returns focus to its button", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(toggle());
    screen.getByRole("link", { name: "Solar Shades" }).focus();
    await user.keyboard("{Escape}");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(toggle());
  });

  it("opens on hover and closes when the pointer leaves, as the CSS menus did", () => {
    render(<Menu />);
    const item = toggle().closest("li")!;
    fireEvent.mouseEnter(item);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseLeave(item);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when clicked while hovered, instead of snapping shut under the pointer", () => {
    render(<Menu />);
    const item = toggle().closest("li")!;
    fireEvent.mouseEnter(item);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseLeave(item);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on a click outside", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(toggle());
    await user.click(document.body);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when focus moves out of it", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(toggle());
    await user.tab(); // to "All shades": still inside, so still open
    await user.tab(); // to "Solar Shades"
    expect(document.activeElement).toHaveTextContent("Solar Shades");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    await user.tab(); // out, to "Elsewhere"
    expect(document.activeElement).toHaveTextContent("Elsewhere");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the page changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Menu />);
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    pathname = "/shades/solar-shades";
    rerender(<Menu />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeVisible();
  });
});

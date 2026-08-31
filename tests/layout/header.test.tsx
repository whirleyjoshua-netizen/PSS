import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { business } from "@/content/business";
import { categories } from "@/content/products";

describe("Header", () => {
  it("links every product category", () => {
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: /main/i });

    for (const category of categories) {
      const links = within(nav).getAllByRole("link", {
        name: new RegExp(`^${category.name}$`, "i"),
      });
      expect(links.some((link) => link.getAttribute("href") === `/${category.slug}`)).toBe(true);
    }
  });

  it("offers a tap-to-call link built from business content", () => {
    render(<Header />);
    const call = screen.getAllByRole("link", { name: /call/i })[0];
    expect(call.getAttribute("href")).toBe(business.phone.href);
  });

  it("drives visitors to the consultation form", () => {
    render(<Header />);
    const cta = screen.getAllByRole("link", { name: /consultation/i })[0];
    expect(cta.getAttribute("href")).toBe("/contact");
  });

  it("labels the mobile menu button for screen readers", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: /menu/i })).toBeInTheDocument();
  });

  it("opens and closes the mobile menu, reporting state to assistive tech", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const toggle = screen.getByRole("button", { name: /menu/i });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("exposes child products of a category to keyboard users without hover", () => {
    render(<Header />);
    // Submenu links must exist in the DOM, not appear only on :hover, or the
    // 16 product pages are unreachable by keyboard and invisible to crawlers.
    expect(
      screen.getAllByRole("link", { name: /solar shades/i })[0].getAttribute("href"),
    ).toBe("/shades/solar-shades");
  });
});

describe("Footer", () => {
  it("links the four service-area cities", () => {
    render(<Footer />);
    for (const city of business.serviceArea) {
      expect(screen.getAllByRole("link", { name: new RegExp(city, "i") }).length)
        .toBeGreaterThan(0);
    }
  });

  it("shows contact details from business content only", () => {
    render(<Footer />);
    expect(screen.getByText(business.phone.display)).toBeInTheDocument();
    expect(screen.getByText(business.email)).toBeInTheDocument();
  });

  it("links the legal pages", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /privacy/i }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: /accessibility/i }).getAttribute("href")).toBe(
      "/accessibility",
    );
  });
});

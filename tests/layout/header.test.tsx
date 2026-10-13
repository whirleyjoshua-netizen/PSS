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
        name: new RegExp(`^${category.navLabel}$`, "i"),
      });
      expect(links.some((link) => link.getAttribute("href") === `/${category.slug}`)).toBe(true);
    }
  });

  it("offers a tap-to-call link built from business content", () => {
    render(<Header />);
    const call = screen.getAllByRole("link", { name: /call/i })[0];
    expect(call.getAttribute("href")).toBe(business.phone.href);
  });

  it("drives visitors to the consultation form with the site's form label", () => {
    render(<Header />);
    const cta = screen.getAllByRole("link", { name: "Invite Us Over" })[0];
    expect(cta.getAttribute("href")).toBe("/contact");
    expect(screen.queryByRole("link", { name: /free consultation/i })).toBeNull();
  });

  it("puts About, Reviews, Gallery and FAQ in an About dropdown on the desktop nav", () => {
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: /main/i });
    const about = within(nav).getByRole("link", { name: "About" });
    expect(about).toHaveAttribute("href", "/about");
    // The submenu is in the DOM (CSS reveals it on hover and focus-within), named for screen readers.
    const submenu = within(nav).getByRole("list", { name: "About" });
    const links = within(submenu).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Our family", "/about"],
      ["Reviews", "/reviews"],
      ["Gallery", "/gallery"],
      ["FAQ", "/faq"],
    ]);
  });

  it("lists About, Reviews, Gallery and FAQ in the mobile menu, with the form label on its button", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: /menu/i }));
    const menu = screen.getByRole("navigation", { name: /mobile/i });
    for (const [name, href] of [["About", "/about"], ["Reviews", "/reviews"], ["Gallery", "/gallery"], ["FAQ", "/faq"], ["Invite Us Over", "/contact"]]) {
      expect(within(menu).getByRole("link", { name }), name).toHaveAttribute("href", href);
    }
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

  it("links the family, reviews and questions pages, not the retired guides index", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Our family" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute("href", "/reviews");
    expect(screen.getByRole("link", { name: "Questions & care" })).toHaveAttribute("href", "/faq");
    expect(document.querySelector('footer a[href="/guides"]')).toBeNull();
  });

  it("labels its columns without headings, so they don't crowd every page's outline", () => {
    const { container } = render(<Footer />);
    expect(container.querySelectorAll("h1, h2, h3, h4, h5, h6")).toHaveLength(0);
    for (const label of ["Products", "Service Area", "Get in Touch"]) {
      expect(screen.getByText(label).tagName, label).toBe("P");
    }
  });

  it("groups every column's links under its visible label, the family and reviews links included", () => {
    render(<Footer />);
    for (const label of ["Products", "Service Area", "Get in Touch"]) {
      const nav = screen.getByRole("navigation", { name: label });
      expect(nav.getAttribute("aria-labelledby")).toBe(within(nav).getByText(label).id);
    }
    const touch = screen.getByRole("navigation", { name: "Get in Touch" });
    expect(within(touch).getByRole("link", { name: "Our family" })).toHaveAttribute("href", "/about");
    expect(within(touch).getByRole("link", { name: "Reviews" })).toHaveAttribute("href", "/reviews");
  });

  it("links the legal pages", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /privacy/i }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: /accessibility/i }).getAttribute("href")).toBe(
      "/accessibility",
    );
  });
});

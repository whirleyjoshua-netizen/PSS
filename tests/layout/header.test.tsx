import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { getProductsIn } from "@/lib/content/products";

describe("Header", () => {
  it("links every product category: directly, or as the first link in its dropdown", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: /main/i });

    for (const category of categories) {
      if (getProductsIn(category.slug).length === 0) {
        expect(within(nav).getByRole("link", { name: category.navLabel })).toHaveAttribute("href", `/${category.slug}`);
        continue;
      }
      const toggle = within(nav).getByRole("button", { name: category.navLabel });
      await user.click(toggle);
      const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
      const first = within(panel).getAllByRole("link")[0]!;
      expect(first).toHaveAttribute("href", `/${category.slug}`);
      expect(first).toHaveTextContent(`All ${category.name.toLowerCase()}`);
      await user.click(toggle);
    }
  });

  it("never puts two links to one page side by side in the desktop nav", () => {
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: /main/i });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (let i = 1; i < hrefs.length; i++) expect(hrefs[i], `link ${i}`).not.toBe(hrefs[i - 1]);
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

  it("puts About, Reviews, Gallery and FAQ in an About dropdown on the desktop nav", async () => {
    const user = userEvent.setup();
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: /main/i });
    // About is the toggle, not a link: "Our family" is the panel's link to /about.
    expect(within(nav).queryByRole("link", { name: "About" })).toBeNull();
    await user.click(within(nav).getByRole("button", { name: "About" }));
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

  it("keeps child products in the HTML for crawlers, and opens them for keyboard users without hover", async () => {
    const user = userEvent.setup();
    const { container } = render(<Header />);
    // In the markup even while closed, or the 16 product pages are invisible to crawlers.
    expect(container.querySelector('a[href="/shades/solar-shades"]')).not.toBeNull();
    expect(screen.queryByRole("link", { name: /solar shades/i })).toBeNull(); // closed: out of the a11y tree

    const toggle = screen.getByRole("button", { name: "Shades" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.tab();
    expect(document.activeElement).toHaveAttribute("href", "/shades");
    expect(screen.getByRole("link", { name: /solar shades/i })).toHaveAttribute("href", "/shades/solar-shades");
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

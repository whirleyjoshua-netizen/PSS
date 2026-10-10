import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/(site)/page";
import { business } from "@/content/business";
import { categories } from "@/content/products";

describe("Home", () => {
  it("has exactly one h1 and it carries the tagline", () => {
    const { container } = render(<Home />);
    const headings = container.querySelectorAll("h1");

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain(business.tagline);
  });

  it("links all five product categories", () => {
    const { container } = render(<Home />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));

    for (const category of categories) {
      expect(hrefs).toContain(`/${category.slug}`);
    }
  });

  it("links every service-area city page", () => {
    const { container } = render(<Home />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));

    expect(hrefs).toContain("/service-area/las-vegas");
    expect(hrefs).toContain("/service-area/north-las-vegas");
  });

  it("gives every image alt text", () => {
    const { container } = render(<Home />);
    for (const image of container.querySelectorAll("img")) {
      expect(image.getAttribute("alt")).not.toBeNull();
    }
  });

  it("puts a consultation form above the fold", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /invite us over/i })).toBeInTheDocument();
  });

  it("renders no testimonial section while there are no real testimonials", () => {
    render(<Home />);
    // Guards against placeholder reviews reappearing.
    expect(screen.queryByText(/what customers say/i)).not.toBeInTheDocument();
  });

  it("drives to the contact page and to a phone call", () => {
    const { container } = render(<Home />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));

    expect(hrefs).toContain("/contact");
    expect(hrefs).toContain(business.phone.href);
  });

  it("leads with the family: eyebrow, family section and its link to Meet the family", () => {
    render(<Home />);
    expect(screen.getByText("Family-run window treatments · Las Vegas valley")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /when you invite us in, you[’']re inviting in family/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /meet the family/i })).toHaveAttribute("href", "/about");
  });

  // Owner 2026-10-01 changed the family-brand rule: the homepage family section
  // shows the three of them. The children are still never named.
  it("shows the owners' family photo beside 'inviting in family'", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 2, name: /when you invite us in, you[’']re inviting in family/i });
    const section = heading.closest("section")!;
    const img = section.querySelector("img")!;
    expect(decodeURIComponent(img.getAttribute("src") ?? "")).toContain("/brand/owners-family.webp");
    expect(img.getAttribute("alt")).toMatch(/Josh and Shade/);
  });

  it("closes with Invite us over and the coffee line", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 2, name: /^invite us over\.$/i })).toBeInTheDocument();
    expect(screen.getByText(/you bring the coffee/i)).toBeInTheDocument();
  });

  it("orders the sections people, experience, trust, then products", () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? "";
    const at = (s: string) => text.indexOf(s);
    expect(at("inviting in family")).toBeLessThan(at("What it’s like to work with us"));
    expect(at("What it’s like to work with us")).toBeLessThan(at("Here is what our clients said"));
    expect(at("Here is what our clients said")).toBeLessThan(at("Every treatment, measured for your windows"));
  });
});

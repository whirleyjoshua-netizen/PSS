import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/page";
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
    expect(screen.getByRole("button", { name: /request consultation/i })).toBeInTheDocument();
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
});

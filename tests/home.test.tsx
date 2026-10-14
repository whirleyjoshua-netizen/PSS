import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/(site)/page";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { HOME_OBJECTIONS } from "@/content/consultation";
import { WARRANTY, WARRANTY_LINE } from "@/content/warranty";
import { cityPath } from "@/lib/content/cities";

describe("Home", () => {
  it("has exactly one h1 and it carries the tagline", () => {
    const { container } = render(<Home />);
    const headings = container.querySelectorAll("h1");

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain(business.tagline);
  });

  it("links every product category but outdoor, which the header menu links (owner, 2026-10-14)", () => {
    const { container } = render(<Home />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));

    for (const category of categories.filter((c) => c.slug !== "outdoor")) {
      expect(hrefs).toContain(`/${category.slug}`);
    }
    expect(hrefs).not.toContain("/outdoor");
  });

  it("covers the category cards with Alta catalog photos, never our gallery", () => {
    render(<Home />);
    const section = screen.getByRole("heading", { level: 2, name: "Every treatment, measured for your windows." }).closest("section")!;
    const cards = within(section).getAllByRole("listitem");
    // Outdoor has no Alta photo, so it is left off; every card has a cover.
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual(["Blinds", "Shades", "Shutters", "Motorization"]);
    const covers = Array.from(section.querySelectorAll("img")).map((img) => decodeURIComponent(img.getAttribute("src") ?? ""));
    expect(covers).toHaveLength(cards.length);
    for (const src of covers) expect(src).toContain("/stock/alta/");
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

  it("orders the sections products, experience, family and gallery, then reviews", () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? "";
    const at = (s: string) => {
      const i = text.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(at("Every treatment, measured for your windows.")).toBeLessThan(at("What it’s like to work with us"));
    expect(at("What it’s like to work with us")).toBeLessThan(at("inviting in family"));
    expect(at("inviting in family")).toBeLessThan(at("Installed by the two of us."));
    expect(at("Installed by the two of us.")).toBeLessThan(at("Here is what our clients said"));
    expect(at("Here is what our clients said")).toBeLessThan(at("What usually goes wrong, and how we do it differently."));
  });

  it("answers what usually goes wrong with four promises and the warranty line", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 2, name: "What usually goes wrong, and how we do it differently." });
    const section = heading.closest("section")!;
    const cards = Array.from(section.querySelectorAll("h3")).map((h) => h.textContent);
    expect(cards).toEqual(HOME_OBJECTIONS.map((pain) => pain.answer));
    expect(cards).toEqual([
      "Your lead time, in writing",
      "Our measurement guarantee",
      "Not customer service. Personal service.",
      "We leave it cleaner.",
    ]);
    for (const pain of HOME_OBJECTIONS) {
      expect(within(section).getByText(pain.heard)).toBeInTheDocument();
      expect(within(section).getByText(pain.body)).toBeInTheDocument();
    }
    expect(within(section).getByText(WARRANTY_LINE)).toBeInTheDocument();
    expect(within(section).getByText(WARRANTY.fineprint)).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/holiday|christmas|nov 15|10%/i);
  });

  it("lists the service area as a slim strip of city links with a call link", () => {
    render(<Home />);
    const strip = screen.getByRole("heading", { level: 2, name: "Serving the Las Vegas valley." }).closest("section")!;
    expect(strip.className).not.toMatch(/py-20/);
    const links = within(strip).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      ...business.serviceArea.map(cityPath),
      business.phone.href,
    ]);
    expect(links.map((a) => a.textContent)).toEqual([...business.serviceArea, `Call ${business.phone.display}`]);
  });

  it("ends its sentence headlines with a period", () => {
    render(<Home />);
    for (const title of [
      "Every treatment, measured for your windows.",
      "Installed by the two of us.",
      "Serving the Las Vegas valley.",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });
});

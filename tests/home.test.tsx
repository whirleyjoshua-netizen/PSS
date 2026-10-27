import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "@/app/(site)/page";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { HOME_OBJECTIONS } from "@/content/consultation";
import { WARRANTY, WARRANTY_LINE } from "@/content/warranty";
import { cityPath } from "@/lib/content/cities";
import { CategoryGrid } from "@/components/home/Sections";

describe("Home", () => {
  // Owner 2026-10-27 (SEO audit): the h1 carries the search words; the tagline stays visible beneath it.
  it("has exactly one h1, with the search words, and keeps the tagline beneath it", () => {
    const { container } = render(<Home />);
    const headings = container.querySelectorAll("h1");

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Custom blinds, shades and shutters in Las Vegas.");
    expect(screen.getByText(business.tagline, { selector: "p" })).toBeInTheDocument();
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
    const section = screen.getByRole("heading", { level: 2, name: "Measured precisely, made for your windows." }).closest("section")!;
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

  // Owner 2026-10-27: the family section moved off the homepage; it lives on /about.
  it("keeps the family eyebrow but no family section", () => {
    render(<Home />);
    expect(screen.getByText("Family-run window treatments · Las Vegas valley")).toBeInTheDocument();
    expect(screen.queryByText(/inviting in family/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /meet the family/i })).not.toBeInTheDocument();
  });

  it("closes with Invite us over and the coffee line", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 2, name: /^invite us over\.$/i })).toBeInTheDocument();
    expect(screen.getByText(/you bring the coffee/i)).toBeInTheDocument();
  });

  it("orders the sections products, experience and gallery, then reviews", () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? "";
    const at = (s: string) => {
      const i = text.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    expect(at("Measured precisely, made for your windows.")).toBeLessThan(at("Why Las Vegas homeowners work with us."));
    expect(at("Why Las Vegas homeowners work with us.")).toBeLessThan(at("Installed by the two of us."));
    expect(at("Installed by the two of us.")).toBeLessThan(at("Here is what our clients said"));
    expect(at("Here is what our clients said")).toBeLessThan(at("What makes us different."));
  });

  it("says what makes us different with four promises and the warranty line, and no quoted complaints", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 2, name: "What makes us different." });
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
      expect(within(section).getByText(pain.body)).toBeInTheDocument();
    }
    expect(within(section).getByText(WARRANTY_LINE)).toBeInTheDocument();
    expect(within(section).getByText(WARRANTY.fineprint)).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/holiday|christmas|nov 15|10%/i);
    expect(section.textContent).not.toMatch(/[“”]/);
    expect(within(section).getByText("We go the extra mile")).toBeInTheDocument();
  });

  // Owner 2026-10-27: no light strip of its own; the cities sit inside the charcoal closing block.
  it("lists the service area inside the closing block, as city links with a call link", () => {
    render(<Home />);
    const closing = screen.getByRole("heading", { level: 2, name: /^invite us over\.$/i }).closest("section")!;
    const heading = within(closing).getByRole("heading", { level: 3, name: "Serving the Las Vegas valley." });
    const links = within(heading.parentElement!).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      ...business.serviceArea.map(cityPath),
      business.phone.href,
    ]);
    expect(links.map((a) => a.textContent)).toEqual([...business.serviceArea, `Call ${business.phone.display}`]);
  });

  it("ends its sentence headlines with a period", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 3, name: "Serving the Las Vegas valley." })).toBeInTheDocument();
    for (const title of [
      "Measured precisely, made for your windows.",
      "Installed by the two of us.",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });
});

describe("What we install (owner 2026-10-21)", () => {
  it("names the brands, authorized only for Hunter Douglas (owner 2026-10-22, per HD's 2026 media kit)", () => {
    render(<CategoryGrid />);
    expect(screen.getByText("As an Authorized Hunter Douglas Dealer, we serve the Las Vegas valley with Hunter Douglas, Alta and Norman blinds, shades and shutters, in a wide variety of fabrics, materials and textures.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/authorized (alta|norman)|(alta|norman) (authorized )?dealer/i);
  });
});

describe("Why Las Vegas homeowners work with us (owner 2026-10-21)", () => {
  it("carries the search words: Las Vegas, window treatments and the products", () => {
    render(<Home />);
    const section = screen.getByRole("heading", { level: 2, name: "Why Las Vegas homeowners work with us." }).closest("section")!;
    for (const words of [/Las Vegas valley/, /window treatments/, /plantation shutters/, /solar shades/, /motorized shades/, /in-home consultation/i]) {
      expect(section.textContent).toMatch(words);
    }
  });
});

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
    const section = screen.getByRole("heading", { level: 2, name: "Custom blinds, shades and shutters, measured precisely." }).closest("section")!;
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
    expect(at("Custom blinds, shades and shutters, measured precisely.")).toBeLessThan(at("Why Las Vegas homeowners work with us."));
    expect(at("Why Las Vegas homeowners work with us.")).toBeLessThan(at("inviting in family"));
    expect(at("inviting in family")).toBeLessThan(at("Installed by the two of us."));
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
      "Custom blinds, shades and shutters, measured precisely.",
      "Installed by the two of us.",
      "Serving the Las Vegas valley.",
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

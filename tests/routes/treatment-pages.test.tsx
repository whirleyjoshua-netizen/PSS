import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CategoryPage from "@/app/(site)/[category]/page";
import CityPage from "@/app/(site)/service-area/[city]/page";
import ReviewsPage from "@/app/(site)/reviews/page";
import { categories } from "@/content/products";
import { consultationPhoto } from "@/content/gallery";
import { FEATURED_REVIEW } from "@/components/booking/FeaturedReview";

const category = (slug: string) => categories.find((c) => c.slug === slug)!;
const renderCategory = async (slug: string) => render(await CategoryPage({ params: Promise.resolve({ category: slug }) }));
const srcs = (root: Element) => Array.from(root.querySelectorAll("img")).map((img) => decodeURIComponent(img.getAttribute("src") ?? ""));

describe("category page redesign", () => {
  it("Shades: serif hero, icon row, story, photo cards, reviews band, closing CTA", async () => {
    const shades = category("shades");
    const { container } = await renderCategory("shades");

    expect(screen.getByRole("heading", { level: 1, name: "Shades in Las Vegas" }).className).toContain("heading-serif");
    expect(screen.getByText(shades.seo.description)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Highlights" })).getAllByRole("listitem").map((li) => li.textContent))
      .toEqual(shades.highlights.map((h) => h.label));
    expect(screen.getByRole("heading", { level: 2, name: shades.story.heading })).toBeInTheDocument();
    expect(screen.getByText(shades.story.caption.line)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meet the family" })).toHaveAttribute("href", "/about");

    expect(screen.getByRole("heading", { level: 2, name: "Explore Shades" })).toBeInTheDocument();
    const roller = screen.getByRole("link", { name: /Roller Shades/ });
    expect(roller).toHaveAttribute("href", "/shades/roller-shades");
    expect(roller.querySelector("img")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Solar Shades/ }).querySelector("img")).toBeNull();

    expect(screen.getByText(/In our clients/)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(FEATURED_REVIEW!.quote.slice(0, 30)))).toHaveLength(1);
    expect(screen.getByRole("link", { name: /invite us over/i })).toHaveAttribute("href", "#book");

    const all = srcs(container);
    expect(new Set(all).size).toBe(all.length);
  });

  it("Motorization: consultation photo in the hero, fabric panel in the story, no Explore grid", async () => {
    const { container } = await renderCategory("motorization");
    expect(srcs(container.querySelector("section#book")!)[0]).toContain(consultationPhoto.src);
    expect(screen.queryByRole("heading", { level: 2, name: /Explore/ })).toBeNull();
    const story = screen.getByRole("heading", { level: 2, name: category("motorization").story.heading }).closest("section")!;
    expect(story.querySelector("img")).toBeNull();
  });

  it("Blinds: product photos already used above become fabric panels on the cards", async () => {
    const { container } = await renderCategory("blinds");
    const cards = screen.getByRole("heading", { level: 2, name: "Explore Blinds" }).closest("section")!;
    expect(cards.querySelectorAll("img")).toHaveLength(0);
    const all = srcs(container);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("pages outside the redesign keep the booking block", () => {
  it("a city page has no serif hero", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: "henderson" }) }));
    expect(container.querySelector("section#book")).not.toBeNull();
    expect(container.querySelector(".heading-serif")).toBeNull();
  });

  it("the reviews page has no serif hero", () => {
    const { container } = render(<ReviewsPage />);
    expect(container.querySelector(".heading-serif")).toBeNull();
  });
});

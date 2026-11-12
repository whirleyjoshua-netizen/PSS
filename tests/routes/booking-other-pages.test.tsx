import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CityPage from "@/app/(site)/service-area/[city]/page";
import ReviewsPage from "@/app/(site)/reviews/page";
import ContactPage from "@/app/(site)/contact/page";
import { cities } from "@/content/cities";
import { consultationPhoto, contactCollage } from "@/content/gallery";

describe.each(cities.map((city) => [city.slug, city] as const))("/service-area/%s", (slug, city) => {
  it("books with the short form, filed under this city, under its own heading", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: slug }) }));

    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector('input[name="city"]')).toHaveValue(city.name);
    expect(container.querySelector('input[name="treatments"]')).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: `Book a free consultation in ${city.name}.` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });

  it("sends the closing Invite Us Over to the booking form on this page", async () => {
    render(await CityPage({ params: Promise.resolve({ city: slug }) }));
    const links = screen.getAllByRole("link", { name: /invite us over/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "#book");
  });
});

describe("/reviews", () => {
  it("ends with the booking block instead of a link away", () => {
    const { container } = render(<ReviewsPage />);
    expect(container.querySelector("section#book form")).not.toBeNull();
    expect(container.querySelector('input[name="treatments"]')).toBeNull();
  });
});

describe("/reviews booking block", () => {
  it("does not repeat a quote or link the page to itself", () => {
    const { container } = render(<ReviewsPage />);
    const block = container.querySelector("section#book")!;
    expect(block.querySelector("figure")).toBeNull();
    expect(block.querySelector('a[href="/reviews"]')).toBeNull();
  });
});

describe("/contact", () => {
  // Owner 2026-11-12: the family photo comes off /contact; three real installs replace it.
  it("shows the install snapshots beside the form, not the family photo or the stand-in", () => {
    const { container } = render(<ContactPage />);
    const srcs = Array.from(container.querySelectorAll("img")).map((img) => decodeURIComponent(img.getAttribute("src") ?? ""));
    for (const { photo } of contactCollage) {
      expect(screen.getByRole("img", { name: photo.alt })).toBeTruthy();
      expect(srcs.some((src) => src.includes(photo.src))).toBe(true);
    }
    expect(srcs.some((src) => src.includes("/brand/"))).toBe(false);
    expect(screen.queryByRole("img", { name: /Josh and Shade/ })).toBeNull();
    expect(container.querySelector('img[alt="' + consultationPhoto.alt + '"]')).toBeNull();
  });
});

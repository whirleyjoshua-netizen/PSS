import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CityPage from "@/app/(site)/service-area/[city]/page";
import ReviewsPage from "@/app/(site)/reviews/page";
import ContactPage from "@/app/(site)/contact/page";
import { cities } from "@/content/cities";
import { consultationPhoto } from "@/content/gallery";

describe.each(cities.map((city) => [city.slug, city] as const))("/service-area/%s", (slug, city) => {
  it("books with the short form, filed under this city, under its own heading", async () => {
    const { container } = render(await CityPage({ params: Promise.resolve({ city: slug }) }));

    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector('input[name="city"]')).toHaveValue(city.name);
    expect(
      screen.getByRole("heading", { level: 2, name: `Book a free consultation in ${city.name}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });
});

describe("/reviews", () => {
  it("ends with the booking block instead of a link away", () => {
    const { container } = render(<ReviewsPage />);
    expect(container.querySelector("section#book form")).not.toBeNull();
  });
});

describe("/contact", () => {
  it("shows the consultation photo beside the form", () => {
    render(<ContactPage />);
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
  });
});

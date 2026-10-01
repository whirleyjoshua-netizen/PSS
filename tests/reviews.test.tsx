import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ReviewsPage from "@/app/(site)/reviews/page";
import AboutPage from "@/app/(site)/about/page";
import Home from "@/app/(site)/page";
import { pastReviews } from "@/content/reviews";
import { formatReviewDate } from "@/components/reviews/ReviewCard";

describe("past-work reviews content", () => {
  it("never publishes a full last name", () => {
    for (const review of pastReviews) {
      expect(review.name).toMatch(/^[A-Z][A-Za-z'-]+ [A-Z]\.$/);
    }
  });

  it("dates every review by month", () => {
    for (const review of pastReviews) {
      expect(review.date).toMatch(/^20\d{2}-(0[1-9]|1[0-2])$/);
    }
  });

  it("has quotes about both owners", () => {
    expect(pastReviews.some((review) => review.about === "Josh")).toBe(true);
    expect(pastReviews.some((review) => review.about === "Shade")).toBe(true);
  });

  it("formats survey months for display", () => {
    expect(formatReviewDate("2024-03")).toBe("Mar 2024");
    expect(formatReviewDate("2023-12")).toBe("Dec 2023");
  });
});

describe("reviews are labeled as the owners' earlier work", () => {
  // These are not Premier Shade customer reviews; every surface must say so.
  it("on the homepage", () => {
    render(<Home />);
    expect(screen.getByText(/before we opened Premier Shade Solutions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read every review/i })).toHaveAttribute("href", "/reviews");
  });

  it("on the about page", () => {
    render(<AboutPage />);
    expect(screen.getByText(/before Premier Shade Solutions/i)).toBeInTheDocument();
  });

  it("on the reviews page", () => {
    const { container } = render(<ReviewsPage />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    // The hero lead labels the whole wall...
    expect(screen.getByText(/^These surveys come from/)).toHaveTextContent(
      /before we opened Premier Shade Solutions/i,
    );
    // ...and the booking block's featured quote carries its own label.
    const book = container.querySelector<HTMLElement>("section#book");
    expect(book).not.toBeNull();
    expect(within(book!).getByText(/before we opened Premier Shade Solutions/i)).toBeInTheDocument();
  });
});

describe("reviews page filters", () => {
  it("shows every written review by default", () => {
    render(<ReviewsPage />);
    expect(screen.getAllByRole("article")).toHaveLength(pastReviews.length);
  });

  it("narrows to one owner and back", () => {
    render(<ReviewsPage />);
    const filters = screen.getByRole("group", { name: /show reviews about/i });

    fireEvent.click(within(filters).getByRole("button", { name: "Shade" }));
    const shadeCards = screen.getAllByRole("article");
    expect(shadeCards).toHaveLength(pastReviews.filter((review) => review.about === "Shade").length);
    for (const card of shadeCards) expect(card).toHaveTextContent("About Shade");
    expect(within(filters).getByRole("button", { name: "Shade" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(filters).getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("article")).toHaveLength(pastReviews.length);
  });
});

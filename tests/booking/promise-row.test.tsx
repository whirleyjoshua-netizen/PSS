import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PromiseRow, PROMISES, FAMILY_LINE } from "@/components/booking/PromiseRow";
import { FeaturedReviewCard, FEATURED_REVIEW } from "@/components/booking/FeaturedReview";
import { pastWork } from "@/content/reviews";

describe("PromiseRow", () => {
  it("lists the three promises and the family line", () => {
    render(<PromiseRow />);
    const list = screen.getByRole("list", { name: "What you get" });
    expect(Array.from(list.querySelectorAll("li")).map((li) => li.textContent)).toEqual(PROMISES);
    expect(screen.getByText(FAMILY_LINE)).toBeInTheDocument();
  });

  it("centres both when asked", () => {
    render(<PromiseRow centered />);
    expect(screen.getByRole("list", { name: "What you get" }).className).toContain("justify-center");
    expect(screen.getByText(FAMILY_LINE).className).toContain("text-center");
  });
});

describe("FeaturedReviewCard", () => {
  it("quotes the first spotlight review with stars and the before-Premier label", () => {
    render(<FeaturedReviewCard />);
    expect(FEATURED_REVIEW?.spotlight).toBe(true);
    expect(screen.getByRole("img", { name: "5 out of 5 stars" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(FEATURED_REVIEW!.quote.slice(0, 30)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`From our years with ${pastWork.source}, before we opened Premier Shade Solutions`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read every review" })).toHaveAttribute("href", "/reviews");
  });
});

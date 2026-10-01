import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingBlock, FAMILY_LINE } from "@/components/booking/BookingBlock";
import { consultationPhoto } from "@/content/gallery";

describe("BookingBlock", () => {
  it("puts the short form, the photo and the family line together", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} />);

    expect(screen.getByRole("button", { name: /invite us over/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: consultationPhoto.alt })).toBeInTheDocument();
    expect(screen.getByText(FAMILY_LINE)).toBeInTheDocument();
    expect(container.querySelector("section#book")).not.toBeNull();
    expect(document.getElementById("book-name")).not.toBeNull();
  });

  it("says the review is from the owners' work before Premier Shade and links every review", () => {
    render(<BookingBlock photo={consultationPhoto} />);
    const quote = screen.getByRole("figure");

    expect(within(quote).getByText(/before we opened premier shade solutions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read every review/i })).toHaveAttribute("href", "/reviews");
  });

  it("files the lead under the page's city and the booking source", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} city="Summerlin" />);
    expect(container.querySelector('input[name="city"]')).toHaveValue("Summerlin");
  });

  it("shows a section heading only when the page gives one", () => {
    const { rerender } = render(<BookingBlock photo={consultationPhoto} />);
    expect(screen.queryByRole("heading", { level: 2, name: /in henderson/i })).toBeNull();

    rerender(<BookingBlock photo={consultationPhoto} heading="Book a free consultation in Henderson" />);
    expect(screen.getByRole("heading", { level: 2, name: "Book a free consultation in Henderson" })).toBeInTheDocument();
  });

  it("puts the form first on a phone", () => {
    const { container } = render(<BookingBlock photo={consultationPhoto} />);
    const form = container.querySelector("form")!;
    const image = container.querySelector("img")!;
    expect(form.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

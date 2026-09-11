import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ThankYouPage, { metadata } from "@/app/(site)/thank-you/page";
import { business } from "@/content/business";

describe("/thank-you", () => {
  it("thanks the visitor and lays out the next steps", () => {
    render(<ThankYouPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/thank you/i);
    expect(screen.getByText(/within one business day/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  });

  it("offers the phone number for anyone who needs us sooner", () => {
    render(<ThankYouPage />);

    const call = screen.getByRole("link", { name: business.phone.display });
    expect(call).toHaveAttribute("href", business.phone.href);
  });

  it("is kept out of search results", () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });
});

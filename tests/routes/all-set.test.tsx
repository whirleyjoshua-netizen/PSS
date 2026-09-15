import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

const { default: AllSetPage, metadata } = await import("@/app/(site)/thank-you/all-set/page");
const { business } = await import("@/content/business");

describe("/thank-you/all-set", () => {
  it("shows the exact headline", () => {
    render(<AllSetPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Consider it done.");
  });

  it("shows the glow-up line", () => {
    render(<AllSetPage />);
    expect(
      screen.getByText(
        "Your windows just got put on the list for a serious glow-up. We'll bring the samples, the tape measure and the good ideas; you just be home."
      )
    ).toBeInTheDocument();
  });

  it("links the phone number", () => {
    render(<AllSetPage />);
    expect(screen.getByRole("link", { name: business.phone.display })).toHaveAttribute("href", business.phone.href);
  });

  it("links back to the questionnaire", () => {
    render(<AllSetPage />);
    expect(screen.getByRole("link", { name: "Change my answers" })).toHaveAttribute("href", "/thank-you");
  });

  it("is kept out of search results", () => {
    expect(metadata.robots).toMatchObject({ index: false });
  });
});

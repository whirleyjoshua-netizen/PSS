import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TermsSection } from "@/app/admin/settings/TermsSection";

describe("terms section", () => {
  it("links to the Documents page, where the terms template is edited", () => {
    render(<TermsSection template={{ updatedAt: new Date("2026-09-20T18:00:00Z") }} legacyUpload />);
    const region = screen.getByRole("region", { name: "Contract terms" });
    expect(region).toHaveTextContent(/^Contract termsContracts print the terms from the Documents page, last updated Sun, Sep 20/);
    expect(screen.getByRole("link", { name: "Edit terms on the Documents page" })).toHaveAttribute("href", "/admin/documents");
    expect(region).not.toHaveTextContent("uploaded PDF");
  });
  it("says the uploaded PDF is used until terms are created", () => {
    render(<TermsSection template={null} legacyUpload />);
    expect(screen.getByText("Using the uploaded PDF until you create terms on the Documents page.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the Documents page" })).toHaveAttribute("href", "/admin/documents");
  });
  it("says contracts can't be sent with neither", () => {
    render(<TermsSection template={null} legacyUpload={false} />);
    expect(screen.getByText("No contract terms yet. Contracts can't be sent until you add them on the Documents page.")).toBeInTheDocument();
  });
  it("offers no upload any more", () => {
    const { container } = render(<TermsSection template={null} legacyUpload={false} />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});

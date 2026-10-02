import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InstallSection } from "@/app/admin/settings/InstallSection";

describe("InstallSection", () => {
  it("walks through installing PSS Ops on an iPhone, in order", () => {
    render(<InstallSection />);
    const section = screen.getByRole("region", { name: "Install on your phone" });
    expect(within(section).getByRole("heading", { name: "Install on your phone" })).toBeInTheDocument();
    const steps = within(section).getAllByRole("listitem").map((item) => item.textContent);
    expect(steps).toEqual([
      "On the iPhone, open premiershadesolutions.com/admin in Safari.",
      "Tap the Share button, then Add to Home Screen, then Add.",
      "Open PSS Ops from the home screen.",
      "Enter your email, type the 6-digit code from the email, then tap Turn on Face ID so next time it's one tap.",
    ]);
    expect(within(section).getByRole("list").tagName).toBe("OL");
    expect(section).toHaveTextContent("You stay signed in while you use it at least once every 30 days.");
  });
});

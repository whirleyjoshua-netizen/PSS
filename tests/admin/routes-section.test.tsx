import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/settings/actions", () => ({ saveRouteSettingsAction: vi.fn(async () => ({})) }));
const { RoutesSection } = await import("@/app/admin/settings/RoutesSection");

const settings = { dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 45, install: 240, service: 90 } };

describe("routes section", () => {
  it("shows the working day and each kind's length from the settings", () => {
    render(<RoutesSection settings={settings} />);
    expect(screen.getByRole("region", { name: "Routes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Day starts")).toHaveValue("09:00");
    expect(screen.getByLabelText("Day ends")).toHaveValue("18:00");
    expect(screen.getByLabelText("Consultation length (hours)")).toHaveValue(1);
    expect(screen.getByLabelText("Measure length (hours)")).toHaveValue(0.75);
    expect(screen.getByLabelText("Install length (hours)")).toHaveValue(4);
    expect(screen.getByLabelText("Service length (hours)")).toHaveValue(1.5);
    expect(screen.getByLabelText("Install length (hours)")).toHaveAttribute("name", "installHours");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

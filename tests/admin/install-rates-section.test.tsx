import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/settings/actions", () => ({ saveInstallRatesAction: vi.fn() }));

const { InstallRatesSection } = await import("@/app/admin/settings/InstallRatesSection");

const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 };

describe("InstallRatesSection", () => {
  it("lists every installable treatment, and never the not-sure answer", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Roller shades rate")).toBeInTheDocument();
    expect(screen.getByLabelText("Shutters rate")).toBeInTheDocument();
    expect(screen.queryByLabelText(/not sure/i)).toBeNull();
  });

  it("shows a configured rate and its basis", () => {
    render(<InstallRatesSection rates={[{ treatment: "roller_shades", basis: "window", rateCents: 2500 }]} settings={settings} />);
    expect(screen.getByLabelText("Roller shades rate")).toHaveValue("25");
    expect(screen.getByLabelText("Roller shades priced by")).toHaveValue("window");
  });

  it("leaves an unconfigured rate blank rather than showing a misleading zero", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Shutters rate")).toHaveValue("");
  });

  it("shows the job-level numbers", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Minimum job cost")).toHaveValue("150");
    expect(screen.getByLabelText("Hard surface")).toHaveValue("10");
    expect(screen.getByLabelText("High ladder")).toHaveValue("50");
    expect(screen.getByLabelText("Motorized")).toHaveValue("15");
  });

  it("says the surcharges are charged per window", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(within(screen.getByRole("group", { name: /surcharges/i })).getByText(/per window/i)).toBeInTheDocument();
  });
});

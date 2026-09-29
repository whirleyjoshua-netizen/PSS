import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/settings/actions", () => ({ saveInstallRatesAction: vi.fn() }));

const { InstallRatesSection } = await import("@/app/admin/settings/InstallRatesSection");

const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500, measureCents: 7500, takedownCents: 1860, shutterTakedownCents: 233, appSetupSmallCents: 6975, appSetupLargeCents: 15_113 };

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

  it("shows the four extras rates in their own group", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    const extras = screen.getByRole("group", { name: "Extras" });
    expect(within(extras).getByLabelText("Takedown, blinds or drapery (per window)")).toHaveValue("18.60");
    expect(within(extras).getByLabelText("Takedown, shutters (per sq ft)")).toHaveValue("2.33");
    expect(within(extras).getByLabelText("App set-up, 1–3 motors")).toHaveValue("69.75");
    expect(within(extras).getByLabelText("App set-up, 4–9 motors")).toHaveValue("151.13");
    expect(extras).toHaveTextContent("10 or more motors: you enter the set-up price on the job.");
  });

  it("shows the job-level numbers", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Minimum job cost")).toHaveValue("150");
    expect(screen.getByLabelText("Hard surface")).toHaveValue("10");
    expect(screen.getByLabelText("High ladder")).toHaveValue("50");
    expect(screen.getByLabelText("Motorized")).toHaveValue("15");
  });

  it("shows the measurement fee as one flat amount, apart from the per-window surcharges", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(screen.getByLabelText("Measurement fee")).toHaveValue("75");
    // Not inside the per-window surcharge group: the fee does not scale with windows.
    const surcharges = screen.getByRole("group", { name: /surcharges/i });
    expect(within(surcharges).queryByLabelText("Measurement fee")).toBeNull();
    expect(screen.getByText(/flat fee for an installer's measuring visit/i)).toBeInTheDocument();
  });

  it("says the surcharges are charged per window", () => {
    render(<InstallRatesSection rates={[]} settings={settings} />);
    expect(within(screen.getByRole("group", { name: /surcharges/i })).getByText(/per window/i)).toBeInTheDocument();
  });

  it("shows what was submitted, not the saved values, after a failed save", () => {
    const initialState = {
      error: "Minimum job cost: Enter an amount, or 0",
      values: { "rate-roller_shades": "$30", "basis-roller_shades": "sq_ft", minimumCents: "", hardSurfaceCents: "12" },
    };
    render(
      <InstallRatesSection
        rates={[{ treatment: "roller_shades", basis: "window", rateCents: 2500 }]}
        settings={settings}
        initialState={initialState}
      />,
    );
    expect(screen.getByLabelText("Roller shades rate")).toHaveValue("$30");
    expect(screen.getByLabelText("Roller shades priced by")).toHaveValue("sq_ft");
    expect(screen.getByLabelText("Minimum job cost")).toHaveValue("");
    expect(screen.getByLabelText("Hard surface")).toHaveValue("12");
    expect(screen.getByRole("alert")).toHaveTextContent("Minimum job cost: Enter an amount, or 0");
  });
});

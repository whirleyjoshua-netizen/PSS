import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/(site)/thank-you/actions", () => ({ submitQuestionnaire: vi.fn() }));
const { Questionnaire } = await import("@/app/(site)/thank-you/Questionnaire");

const blank = { windowCountExact: null, treatmentTypes: [], motorized: false, address: null, finish: null };

describe("Questionnaire", () => {
  it("asks every question, with nothing required", () => {
    render(<Questionnaire initial={blank} windowRange={null} />);
    const windows = screen.getByLabelText("How many windows?");
    expect(windows.querySelectorAll("option")).toHaveLength(32);
    expect(windows.querySelector("option:last-child")).toHaveTextContent("30+");
    for (const label of ["Horizontal blinds", "Vertical blinds", "Shutters", "Cellular shades", "Roller shades", "Roman shades",
      "Sheer horizontal shadings", "Not sure — show me all the samples"]) {
      expect(screen.getByLabelText(label)).not.toBeChecked();
    }
    expect(screen.getByLabelText(/^Motorized/)).not.toBeChecked();
    // Owner 2026-10-01: the gate code is taken in the scheduler, not asked of the customer.
    expect(screen.queryByLabelText(/gate/i)).toBeNull();
    // Owner 2026-10-20: the finish question is gone from the customer form.
    expect(screen.queryByText(/kind of finish/)).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(document.querySelectorAll("[required]")).toHaveLength(0);
    expect(screen.queryByText(/earlier/)).toBeNull();
  });

  it("prefills saved answers and reminds them of their first answer", () => {
    render(<Questionnaire initial={{ windowCountExact: 31, treatmentTypes: ["not_sure"], motorized: true, address: "12 Sample St", finish: "not_sure" }} windowRange="20+" />);
    expect(screen.getByText("You said 20+ earlier.")).toBeInTheDocument();
    expect(screen.getByLabelText("How many windows?")).toHaveValue("31");
    expect(screen.getByLabelText("Not sure — show me all the samples")).toBeChecked();
    expect(screen.getByLabelText(/^Motorized/)).toBeChecked();
  });
});

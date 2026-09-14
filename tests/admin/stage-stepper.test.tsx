import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StageStepper } from "@/app/admin/jobs/[id]/StageStepper";

const states = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("data-state"));

describe("StageStepper", () => {
  it("shows all seven stages with done, current and upcoming", () => {
    render(<StageStepper status="contacted" />);
    expect(screen.getByRole("list", { name: "Stage" })).toBeInTheDocument();
    expect(states()).toEqual(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Contacted");
  });

  it("marks every earlier stage done at installed", () => {
    render(<StageStepper status="installed" />);
    expect(states()).toEqual(["done", "done", "done", "done", "done", "done", "current"]);
  });

  it("greys out and has no current step when lost", () => {
    render(<StageStepper status="lost" />);
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
    expect(screen.getByRole("list", { name: "Stage" }).className).toContain("opacity-50");
  });
});

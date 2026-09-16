import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/jobs/[id]/install-actions", () => ({ saveInstallQuoteAction: vi.fn() }));

const { InstallCalculator } = await import("@/app/admin/jobs/[id]/InstallCalculator");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const settings = { minimumCents: 15_000, hardSurfaceCents: 1000, highLadderCents: 5000, motorizedCents: 1500 };
const rates = [{ treatment: "roller_shades" as const, basis: "window" as const, rateCents: 2500 }];

describe("InstallCalculator", () => {
  it("says so plainly when no rates are configured, instead of pricing at zero", () => {
    render(<InstallCalculator jobId={JOB} rates={[]} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no installation rates/i);
    expect(screen.queryByRole("button", { name: /save as estimate/i })).toBeNull();
  });

  it("offers a line editor once rates exist", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByRole("button", { name: /add line/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save as estimate/i })).toBeInTheDocument();
  });

  it("shows nothing owed before a line is added", () => {
    render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.getByTestId("install-total")).toHaveTextContent("$0");
  });

  it("lists past snapshots newest first, with kind, total and author", () => {
    render(
      <InstallCalculator jobId={JOB} rates={rates} settings={settings} measurements={[]} saved={[{
        id: "a", kind: "final", minimumCents: 15_000, subtotalCents: 40_000, totalCents: 40_000,
        createdBy: "owner@example.com", createdAt: new Date("2026-09-16T10:00:00Z"), lines: [],
      }, {
        id: "b", kind: "estimate", minimumCents: 15_000, subtotalCents: 30_000, totalCents: 30_000,
        createdBy: "owner@example.com", createdAt: new Date("2026-09-10T10:00:00Z"), lines: [],
      }]} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Final");
    expect(items[0]).toHaveTextContent("$400");
    expect(items[1]).toHaveTextContent("Estimate");
  });

  it("offers to fill from measurements only when the job has some", () => {
    const { rerender } = render(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[]} />);
    expect(screen.queryByRole("button", { name: /fill from measurements/i })).toBeNull();

    rerender(<InstallCalculator jobId={JOB} rates={rates} settings={settings} saved={[]} measurements={[{
      id: "m", room: "Kitchen", label: null, widthEighths: 240, heightEighths: 320,
      requirements: ["high_ladder"],
    }]} />);
    expect(screen.getByRole("button", { name: /fill from measurements/i })).toBeInTheDocument();
  });
});

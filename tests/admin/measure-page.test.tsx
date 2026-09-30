import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/lib/admin/jobs", () => ({ getJob: vi.fn(async () => ({ id: ID, name: "Dana Reyes" })) }));
vi.mock("@/lib/admin/measurements", () => ({
  listMeasurements: vi.fn(async () => [{ room: "Den", quantity: 10 }, { room: "Office", quantity: 2 }]),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app/admin/jobs/[id]/measure/MeasureForm", () => ({
  MeasureForm: ({ defaultRoom }: { defaultRoom: string }) => <p>Form starting in {defaultRoom}</p>,
}));

const { default: MeasurePage } = await import("@/app/admin/jobs/[id]/measure/page");

describe("measure page", () => {
  it("counts windows so far, not saved lines, and starts in the last room", async () => {
    render(await MeasurePage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByText("12 windows so far")).toBeInTheDocument();
    expect(screen.getByText("Form starting in Office")).toBeInTheDocument();
  });
});

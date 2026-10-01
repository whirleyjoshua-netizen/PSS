import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const getMeasurement = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/lib/admin/measurements", () => ({ getMeasurement }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app/admin/jobs/[id]/measure/MeasureForm", () => ({
  MeasureForm: ({ kind }: { kind: string }) => <p>{kind} form</p>,
}));

const { default: EditWindowPage } = await import("@/app/admin/jobs/[id]/measure/[windowId]/page");

describe("edit window page", () => {
  it("names the measure the window belongs to and saves back into it", async () => {
    getMeasurement.mockResolvedValue({ id: WIN, kind: "official", room: "Hall", quantity: 1 });
    render(await EditWindowPage({ params: Promise.resolve({ id: ID, windowId: WIN }) }));
    expect(screen.getByText("Official measure")).toBeInTheDocument();
    expect(screen.getByText("official form")).toBeInTheDocument();
  });
});

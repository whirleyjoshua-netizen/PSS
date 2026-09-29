import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";

vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));
const { MeasurementsTab } = await import("@/app/admin/jobs/[id]/MeasurementsTab");
const { JobFiles } = await import("@/app/admin/jobs/[id]/JobFiles");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
const PHOTO = "5b4d0e3a-0e74-4c75-9c3e-3f4a5b6c7d8e";
const m: WindowMeasurement = {
  id: WIN, leadId: JOB, position: 1, room: "Kitchen", label: "Window 1", widthEighths: 35 * 8 + 5,
  heightEighths: 48 * 8, depthEighths: null, mount: "inside", requirements: [], notes: "Over sink",
  photoFileId: PHOTO, quantity: 1, measuredBy: "joshua@example.com", createdAt: new Date(), updatedAt: new Date(),
};
const photo: JobFile = {
  id: PHOTO, leadId: JOB, createdAt: new Date(), uploadedBy: "joshua@example.com", kind: "photo",
  name: "window.jpg", contentType: "image/jpeg", sizeBytes: 1000, blobPathname: "x", sharedAt: null,
};

describe("MeasurementsTab", () => {
  it("shows one row per window with its sizes", () => {
    render(<MeasurementsTab jobId={JOB} measurements={[m]} files={[photo]} />);
    const row = screen.getByRole("row", { name: /Kitchen/ });
    expect(within(row).getByText("35 ⅝″")).toBeInTheDocument();
    expect(within(row).getByText("48″")).toBeInTheDocument();
    expect(within(row).getByText("Inside")).toBeInTheDocument();
    expect(within(row).getByText("Over sink")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Edit" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure/${WIN}`);
    expect(screen.getByRole("link", { name: "Add measurement" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure`);
  });

  it("counts windows, not lines, and shows each line's quantity", () => {
    const second = { ...m, id: "6c5e1f4b-1f85-4d86-8d4f-4a5b6c7d8e9f", room: "Den", label: null, photoFileId: null, quantity: 10 };
    render(<MeasurementsTab jobId={JOB} measurements={[{ ...m, quantity: 2 }, second]} files={[photo]} />);
    expect(screen.getByRole("heading", { name: "Measurements · 12" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Qty" })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Den/ })).getByRole("cell", { name: "10" })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Kitchen/ })).getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("names the photo file in its share control", () => {
    render(<MeasurementsTab jobId={JOB} measurements={[m]} files={[photo]} />);
    expect(screen.getByRole("switch", { name: "Share window.jpg with customer" })).toBeInTheDocument();
  });

  it("falls back to describing the window when the file row is missing", () => {
    // The measurement still points at a photo id, but no matching file row was
    // loaded — the switch must still say what it would share.
    render(<MeasurementsTab jobId={JOB} measurements={[m]} files={[]} />);
    expect(screen.getByRole("switch", { name: "Share the photo of Window 1 with customer" })).toBeInTheDocument();
  });

  it("falls back to the room when the window has no label either", () => {
    render(<MeasurementsTab jobId={JOB} measurements={[{ ...m, label: null }]} files={[]} />);
    expect(screen.getByRole("switch", { name: "Share the photo of Kitchen with customer" })).toBeInTheDocument();
  });

  it("keeps today's empty state", () => {
    render(<MeasurementsTab jobId={JOB} measurements={[]} files={[]} />);
    expect(screen.getByText("No windows measured yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("JobFiles", () => {
  it("shows no measurements of its own, and keeps window photos out of Photos", () => {
    render(<JobFiles jobId={JOB} measurements={[m]} files={[photo]} />);
    expect(screen.queryByText(/^Measurements ·/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Measure" })).toBeNull();
    expect(screen.getByText("Photos · 0")).toBeInTheDocument();
  });
});

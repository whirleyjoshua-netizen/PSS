import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatWhen } from "@/lib/admin/time";

vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));
vi.mock("@/app/admin/jobs/[id]/KeepOfficialBox", () => ({ KeepOfficialBox: ({ kept, blocked }: { kept: boolean; blocked: boolean }) => <p>box kept={String(kept)} blocked={String(blocked)}</p> }));
const { MeasurementsTab } = await import("@/app/admin/jobs/[id]/MeasurementsTab");
const { JobFiles } = await import("@/app/admin/jobs/[id]/JobFiles");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
const PHOTO = "5b4d0e3a-0e74-4c75-9c3e-3f4a5b6c7d8e";
const m: WindowMeasurement = {
  id: WIN, leadId: JOB, kind: "designer", position: 1, room: "Kitchen", label: "Window 1", widthEighths: 35 * 8 + 5,
  heightEighths: 48 * 8, depthEighths: null, mount: "inside", requirements: [], notes: "Over sink",
  photoFileId: PHOTO, quantity: 1, measuredBy: "joshua@example.com", createdAt: new Date(), updatedAt: new Date(),
};
const photo: JobFile = {
  id: PHOTO, leadId: JOB, createdAt: new Date(), uploadedBy: "joshua@example.com", kind: "photo",
  name: "window.jpg", contentType: "image/jpeg", sizeBytes: 1000, blobPathname: "x", sharedAt: null,
};

describe("MeasurementsTab", () => {
  it("shows one row per window with its sizes", () => {
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m], kept: null }} files={[photo]} />);
    const row = screen.getByRole("row", { name: /Kitchen/ });
    expect(within(row).getByText("35 ⅝″")).toBeInTheDocument();
    expect(within(row).getByText("48″")).toBeInTheDocument();
    expect(within(row).getByText("Inside")).toBeInTheDocument();
    expect(within(row).getByText("Over sink")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Edit" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure/${WIN}`);
    expect(screen.getByRole("link", { name: "Add to designer measure" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure?kind=designer`);
  });

  it("counts windows, not lines, and shows each line's quantity", () => {
    const second = { ...m, id: "6c5e1f4b-1f85-4d86-8d4f-4a5b6c7d8e9f", room: "Den", label: null, photoFileId: null, quantity: 10 };
    render(<MeasurementsTab jobId={JOB} set={{ windows: [{ ...m, quantity: 2 }, second], kept: null }} files={[photo]} />);
    expect(screen.getByRole("heading", { name: "Designer measure · 12" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Qty" })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Den/ })).getByRole("cell", { name: "10" })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Kitchen/ })).getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("names the photo file in its share control", () => {
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m], kept: null }} files={[photo]} />);
    expect(screen.getByRole("switch", { name: "Share window.jpg with customer" })).toBeInTheDocument();
  });

  it("falls back to describing the window when the file row is missing", () => {
    // The measurement still points at a photo id, but no matching file row was
    // loaded — the switch must still say what it would share.
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m], kept: null }} files={[]} />);
    expect(screen.getByRole("switch", { name: "Share the photo of Window 1 with customer" })).toBeInTheDocument();
  });

  it("falls back to the room when the window has no label either", () => {
    render(<MeasurementsTab jobId={JOB} set={{ windows: [{ ...m, label: null }], kept: null }} files={[]} />);
    expect(screen.getByRole("switch", { name: "Share the photo of Kitchen with customer" })).toBeInTheDocument();
  });

  it("keeps today's empty state", () => {
    render(<MeasurementsTab jobId={JOB} set={{ windows: [], kept: null }} files={[]} />);
    expect(screen.getByText("No windows measured yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the two measures in separate sections", () => {
    const official = { ...m, id: "7d6f2a5c-2a96-4e97-9e5a-5b6c7d8e9f0a", kind: "official" as const, room: "Den", photoFileId: null };
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m, official], kept: null }} files={[photo]} />);
    const designer = screen.getByRole("region", { name: /Designer measure/ });
    const off = screen.getByRole("region", { name: /Official measure/ });
    expect(within(designer).getByRole("row", { name: /Kitchen/ })).toBeInTheDocument();
    expect(within(designer).queryByRole("row", { name: /Den/ })).toBeNull();
    expect(within(off).getByRole("row", { name: /Den/ })).toBeInTheDocument();
    expect(within(off).getByRole("link", { name: "Add to official measure" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure?kind=official`);
    expect(screen.getByText("box kept=false blocked=true")).toBeInTheDocument();
  });

  it("says an empty official measure has not been taken", () => {
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m], kept: null }} files={[photo]} />);
    expect(within(screen.getByRole("region", { name: /Official measure/ })).getByText("No official measure yet.")).toBeInTheDocument();
  });

  it("when kept, says the designer measure is the official one and offers no official add", () => {
    const kept = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m], kept }} files={[photo]} />);
    const off = screen.getByRole("region", { name: /Official measure/ });
    expect(off).toHaveTextContent(`Using the designer measure (kept as official by owner@example.com, ${formatWhen(kept.at)}).`);
    expect(within(off).queryByRole("link", { name: "Add to official measure" })).toBeNull();
    expect(screen.getByText("box kept=true blocked=false")).toBeInTheDocument();
  });

  it("never hides official rows, even on a kept job (the accepted race)", () => {
    const kept = { at: new Date("2026-10-01T15:00:00Z"), by: "owner@example.com" };
    const official = { ...m, id: "8e7a3b6d-3ba7-4fa8-8f6b-6c7d8e9f0a1b", kind: "official" as const, room: "Den", photoFileId: null };
    render(<MeasurementsTab jobId={JOB} set={{ windows: [m, official], kept }} files={[photo]} />);
    expect(within(screen.getByRole("region", { name: /Official measure/ })).getByRole("row", { name: /Den/ })).toBeInTheDocument();
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

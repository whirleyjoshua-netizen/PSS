import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/app/admin/jobs/measure-actions", () => ({
  removeFile: vi.fn(), removeMeasurement: vi.fn(), setFileShared: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { JobFiles } = await import("@/app/admin/jobs/[id]/JobFiles");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const file = (id: string, kind: "photo" | "document", sharedAt: Date | null, name = `${id}.jpg`) => ({
  id, leadId: JOB, createdAt: new Date("2026-09-13T10:00:00Z"), uploadedBy: "owner@example.com",
  kind, name, contentType: kind === "photo" ? "image/jpeg" : "application/pdf", sizeBytes: 2048,
  blobPathname: `jobs/${JOB}/${id}`, sharedAt,
});
const measurement = {
  id: "m1", leadId: JOB, createdAt: new Date(), updatedAt: new Date(), measuredBy: "owner@example.com",
  position: 1, room: "Kitchen", label: null, widthEighths: 280, heightEighths: 384, depthEighths: null,
  mount: "inside" as const, requirements: [], notes: null, photoFileId: "window-photo",
};

describe("JobFiles photos and sharing", () => {
  const files = [
    file("install-1", "photo", new Date()),
    file("install-2", "photo", null),
    file("window-photo", "photo", null),
    file("quote", "document", null, "Quote.pdf"),
  ];

  it("lists photos not attached to a window, with an Add photo button", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const photos = screen.getByRole("heading", { name: "Photos · 2" }).parentElement!;
    expect(within(photos).getAllByRole("img")).toHaveLength(2);
    expect(screen.getByLabelText("Add photo")).toBeInTheDocument();
  });

  it("gives every photo a share switch showing its state, and documents none", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const switches = screen.getAllByRole("switch", { name: /share with customer/i });
    expect(switches).toHaveLength(3);
    expect(switches.filter((s) => s.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getAllByText("Shared")).toHaveLength(1);
  });
});

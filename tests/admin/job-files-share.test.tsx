import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const setFileShared = vi.fn();
const setFileDocType = vi.fn();
vi.mock("@/app/admin/jobs/measure-actions", () => ({
  removeFile: vi.fn(), removeMeasurement: vi.fn(), setFileShared, setFileDocType,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { JobFiles } = await import("@/app/admin/jobs/[id]/JobFiles");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const file = (
  id: string, kind: "photo" | "document", sharedAt: Date | null,
  name = `${id}.jpg`, docType: "quote" | "po" | "invoice" | "other" | null = null,
) => ({
  id, leadId: JOB, createdAt: new Date("2026-09-13T10:00:00Z"), uploadedBy: "owner@example.com",
  kind, name, contentType: kind === "photo" ? "image/jpeg" : "application/pdf", sizeBytes: 2048,
  blobPathname: `jobs/${JOB}/${id}`, sharedAt, docType,
});
const measurement = {
  id: "m1", leadId: JOB, createdAt: new Date(), updatedAt: new Date(), measuredBy: "owner@example.com",
  position: 1, room: "Kitchen", label: null, widthEighths: 280, heightEighths: 384, depthEighths: null,
  mount: "inside" as const, requirements: [], notes: null, photoFileId: "window-photo",
};

beforeEach(() => {
  setFileShared.mockReset();
  setFileDocType.mockReset();
});

describe("JobFiles photos and sharing", () => {
  const files = [
    file("install-1", "photo", new Date(), "install-1.jpg"),
    file("install-2", "photo", null),
    file("window-photo", "photo", null),
    file("quote", "document", null, "Quote.pdf", "quote"),
    file("po", "document", null, "PO.pdf"),
  ];

  it("lists photos not attached to a window, with an Add photo button", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const photos = screen.getByRole("heading", { name: "Photos · 2" }).parentElement!;
    expect(within(photos).getAllByRole("img")).toHaveLength(2);
    expect(screen.getByLabelText("Add photo")).toBeInTheDocument();
  });

  it("gives every photo and document a share switch showing its state", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const switches = screen.getAllByRole("switch", { name: /share .+ with customer/i });
    expect(switches).toHaveLength(4);
    expect(switches.filter((s) => s.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getAllByText("Shared")).toHaveLength(1);
  });

  it("names the file in each share control, so the consequence is explicit", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    expect(screen.getByRole("switch", { name: "Share Quote.pdf with customer" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Share install-2.jpg with customer" })).toBeInTheDocument();
  });

  it("gives each document a type select, defaulting to its current type or blank", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const select = screen.getByRole("combobox", { name: "Document type for Quote.pdf" });
    expect(select).toHaveValue("quote");
    expect([...(select as HTMLSelectElement).options].map((o) => o.value))
      .toEqual(["", "quote", "po", "invoice", "other"]);
    expect([...(select as HTMLSelectElement).options].map((o) => o.text))
      .toEqual(["No type", "Quote", "PO", "Invoice", "Other"]);
    expect(screen.getByRole("combobox", { name: "Document type for PO.pdf" })).toHaveValue("");
  });

  it("gives photos no type select", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    expect(screen.queryByRole("combobox", { name: /Document type for install-1\.jpg/ })).toBeNull();
  });

  it("labels a document without sharing it", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Document type for PO.pdf" }), {
      target: { value: "invoice" },
    });
    expect(setFileDocType).toHaveBeenCalledWith(JOB, "po", "invoice");
    expect(setFileShared).not.toHaveBeenCalled();
  });

  it("clears the label back to null when the blank option is chosen", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Document type for Quote.pdf" }), {
      target: { value: "" },
    });
    expect(setFileDocType).toHaveBeenCalledWith(JOB, "quote", null);
    expect(setFileShared).not.toHaveBeenCalled();
  });
});

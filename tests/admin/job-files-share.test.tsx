import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
  name = `${id}.jpg`, docType: "quote" | "po" | "invoice" | "other" | "dealer_copy" | null = null,
) => ({
  id, leadId: JOB, createdAt: new Date("2026-09-13T10:00:00Z"), uploadedBy: "owner@example.com",
  kind, name, contentType: kind === "photo" ? "image/jpeg" : "application/pdf", sizeBytes: 2048,
  blobPathname: `jobs/${JOB}/${id}`, sharedAt, docType,
});
const measurement = {
  id: "m1", leadId: JOB, createdAt: new Date(), updatedAt: new Date(), measuredBy: "owner@example.com",
  position: 1, room: "Kitchen", label: null, widthEighths: 280, heightEighths: 384, depthEighths: null,
  mount: "inside" as const, requirements: [], notes: null, photoFileId: "window-photo", quantity: 1,
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
      .toEqual(["", "quote", "po", "invoice", "contract", "other"]);
    expect([...(select as HTMLSelectElement).options].map((o) => o.text))
      .toEqual(["No type", "Quote", "PO", "Invoice", "Contract", "Other"]);
    expect(screen.getByRole("combobox", { name: "Document type for PO.pdf" })).toHaveValue("");
  });

  it("gives photos no type select", () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    expect(screen.queryByRole("combobox", { name: /Document type for install-1\.jpg/ })).toBeNull();
  });

  it("labels a document without sharing it", async () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Document type for PO.pdf" }), {
      target: { value: "invoice" },
    });
    await waitFor(() => expect(setFileDocType).toHaveBeenCalledWith(JOB, "po", "invoice"));
    expect(setFileShared).not.toHaveBeenCalled();
  });

  it("clears the label back to null when the blank option is chosen", async () => {
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Document type for Quote.pdf" }), {
      target: { value: "" },
    });
    await waitFor(() => expect(setFileDocType).toHaveBeenCalledWith(JOB, "quote", null));
    expect(setFileShared).not.toHaveBeenCalled();
  });

  it("puts the old type back and says so when the save fails", async () => {
    setFileDocType.mockRejectedValueOnce(new Error("nope"));
    render(<JobFiles jobId={JOB} measurements={[measurement]} files={files} />);
    const select = screen.getByRole("combobox", { name: "Document type for Quote.pdf" });
    fireEvent.change(select, { target: { value: "invoice" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save that type"));
    expect(select).toHaveValue("quote");
    expect(setFileShared).not.toHaveBeenCalled();
  });
});

describe("JobFiles on a signed contract", () => {
  const signed = (f: ReturnType<typeof file>) => ({ ...f, signed: true });
  const files = [
    signed(file("contract", "document", new Date(), "Contract.pdf", null)),
    signed(file("stamped", "document", new Date(), "Contract (signed).pdf", null)),
    file("plain", "document", new Date(), "Plain.pdf", "quote"),
  ];
  const row = (name: string) => screen.getByRole("link", { name }).closest("li")!;

  it("shows the record label instead of type, share and delete on the original and its stamped copy", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={files} />);
    for (const name of ["Contract.pdf", "Contract (signed).pdf"]) {
      const li = within(row(name));
      expect(li.getByText("Signed — kept as the record")).toBeInTheDocument();
      expect(li.queryByRole("combobox")).toBeNull();
      expect(li.queryByRole("switch")).toBeNull();
      expect(li.queryByRole("button", { name: "Delete" })).toBeNull();
    }
  });

  it("keeps every control, and no label, on a file nobody signed", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={files} />);
    const li = within(row("Plain.pdf"));
    expect(li.queryByText("Signed — kept as the record")).toBeNull();
    expect(li.getByRole("combobox", { name: "Document type for Plain.pdf" })).toBeInTheDocument();
    expect(li.getByRole("switch", { name: "Share Plain.pdf with customer" })).toBeInTheDocument();
    expect(li.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("still says the signed copies are shared, and still links to them", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={files} />);
    expect(within(row("Contract.pdf")).getByText("Shared")).toBeInTheDocument();
    expect(row("Contract (signed).pdf").querySelector('a[href="/admin/files/stamped"]')).not.toBeNull();
  });
});

describe("JobFiles on a contract generated from a quote version", () => {
  const files = [
    { ...file("gen", "document", new Date(), "Contract PSS-1042 v2.pdf", null), docType: "contract" as const, quoteContract: true },
    file("plain", "document", null, "Plain.pdf", "quote"),
  ];
  const row = (name: string) => screen.getByRole("link", { name }).closest("li")!;

  it("shows its label and sends the owner to the Quote tab, with no type, share or delete control", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={files} />);
    const li = within(row("Contract PSS-1042 v2.pdf"));
    expect(li.getByText("Contract · managed from the Quote tab")).toBeInTheDocument();
    expect(li.queryByRole("combobox")).toBeNull();
    expect(li.queryByRole("switch")).toBeNull();
    expect(li.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(li.getByText("Shared")).toBeInTheDocument();
  });

  it("leaves every control on an ordinary document", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={files} />);
    const li = within(row("Plain.pdf"));
    expect(li.queryByText("Contract · managed from the Quote tab")).toBeNull();
    expect(li.getByRole("switch", { name: "Share Plain.pdf with customer" })).toBeInTheDocument();
  });

  it("offers no type, share or delete control on a job document's PDF", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={[{ ...file("docpdf", "document", new Date(), "Service agreement — PSS-1048.pdf", null), jobDocument: true }]} />);
    const row = screen.getByText("Service agreement — PSS-1048.pdf").closest("li")!;
    expect(within(row).getByText("Document · managed from the Documents tab")).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(within(row).queryByRole("switch")).toBeNull();
    expect(within(row).queryByRole("combobox")).toBeNull();
  });
});

describe("JobFiles on a Dealer Copy", () => {
  const files = [
    file("dealer", "document", null, "DEALER COPY 1.html", "dealer_copy"),
    file("plain", "document", null, "Plain.pdf", "quote"),
  ];
  const row = (name: string) => screen.getByRole("link", { name }).closest("li")!;

  it("says it is internal and offers no type, share or delete control", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={files} />);
    const li = within(row("DEALER COPY 1.html"));
    expect(li.getByText("Dealer copy · internal, never shared")).toBeInTheDocument();
    expect(li.queryByRole("combobox")).toBeNull();
    expect(li.queryByRole("switch")).toBeNull();
    expect(li.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("still links to it, and leaves every control on the other documents", () => {
    render(<JobFiles jobId={JOB} measurements={[]} files={files} />);
    expect(row("DEALER COPY 1.html").querySelector('a[href="/admin/files/dealer"]')).not.toBeNull();
    const li = within(row("Plain.pdf"));
    expect(li.queryByText("Dealer copy · internal, never shared")).toBeNull();
    expect(li.getByRole("combobox", { name: "Document type for Plain.pdf" })).toBeInTheDocument();
    expect(li.getByRole("switch", { name: "Share Plain.pdf with customer" })).toBeInTheDocument();
    expect(li.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

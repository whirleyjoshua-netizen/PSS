import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resource } from "@/lib/admin/resource-rules";

const actions = { saveResourceAction: vi.fn(), renameResourceAction: vi.fn(), recategorizeResourceAction: vi.fn(), deleteResourceAction: vi.fn() };
vi.mock("@/app/admin/resources/actions", () => actions);
const upload = vi.fn();
vi.mock("@vercel/blob/client", () => ({ upload }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = { listResources: vi.fn(), listCategories: vi.fn() };
vi.mock("@/lib/admin/resources", () => store);

const { ResourceList } = await import("@/app/admin/resources/ResourceList");
const { ResourceUploader } = await import("@/app/admin/resources/ResourceUploader");
const { default: ResourcesPage } = await import("@/app/admin/resources/page");

const file = (id: string, name: string, category: string, sizeBytes = 1536 * 1024): Resource => ({
  id, name, category, contentType: "application/pdf", sizeBytes, uploadedBy: "joshua.whirley@example.com", createdAt: new Date("2026-10-02T17:00:00Z"),
});
const LIST = [file("a", "W-9.pdf", "Licenses"), file("b", "Duette spec.pdf", "Spec books"), file("c", "COI 2026.pdf", "Licenses")];
const PATH = /^resources\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

beforeEach(() => {
  vi.clearAllMocks();
  for (const a of Object.values(actions)) a.mockResolvedValue({ ok: true });
  upload.mockImplementation(async (pathname: string, _file: File, options: { onUploadProgress?: (e: { percentage: number }) => void }) => {
    options.onUploadProgress?.({ percentage: 100 });
    return { pathname };
  });
  requireAdmin.mockResolvedValue({ email: "owner@example.com" });
});

describe("ResourceList", () => {
  it("groups files by category, each linked to open in a new tab, with size and who added it", () => {
    render(<ResourceList resources={LIST} categories={["Licenses", "Spec books"]} />);
    const groups = screen.getAllByRole("region");
    expect(groups.map((g) => within(g).getByRole("heading").textContent)).toEqual(["Licenses (2)", "Spec books (1)"]);
    const link = within(groups[0]).getAllByRole("link")[0];
    expect(link).toHaveTextContent("COI 2026.pdf");
    expect(link).toHaveAttribute("href", "/admin/resources/c");
    expect(link).toHaveAttribute("target", "_blank");
    expect(groups[0]).toHaveTextContent("1.5 MB");
    expect(groups[0]).toHaveTextContent("Joshua Whirley");
  });

  it("searches by name or category", () => {
    render(<ResourceList resources={LIST} categories={[]} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search files" }), { target: { value: "duette" } });
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Duette spec.pdf"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search files" }), { target: { value: "zzz" } });
    expect(screen.getByText("No files match.")).toBeInTheDocument();
  });

  it("says how to start when there are no files", () => {
    render(<ResourceList resources={[]} categories={[]} />);
    expect(screen.getByText(/No files yet\./)).toBeInTheDocument();
  });

  it("renames a file", async () => {
    render(<ResourceList resources={[LIST[0]]} categories={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename W-9.pdf" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New name" }), { target: { value: "Form W-9.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.renameResourceAction).toHaveBeenCalledWith("a", "Form W-9.pdf"));
  });

  it("moves a file to another category and shows a refusal", async () => {
    actions.recategorizeResourceAction.mockResolvedValue({ error: "That file was deleted." });
    render(<ResourceList resources={[LIST[0]]} categories={["Licenses", "Tax"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Move W-9.pdf" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Tax" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.recategorizeResourceAction).toHaveBeenCalledWith("a", "Tax"));
    expect(await screen.findByRole("alert")).toHaveTextContent("That file was deleted.");
  });

  it("deletes only after a second, inline confirmation", async () => {
    render(<ResourceList resources={[LIST[0]]} categories={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete W-9.pdf" }));
    expect(actions.deleteResourceAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete W-9.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(actions.deleteResourceAction).toHaveBeenCalledWith("a"));
  });
});

describe("ResourceUploader", () => {
  const pick = (files: File[]) => fireEvent.change(screen.getByLabelText("Choose files"), { target: { files } });

  it("uploads each file privately and straight to storage, then records it under the category", async () => {
    render(<ResourceUploader categories={["Licenses"]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Licenses" } });
    await act(async () => pick([new File(["%PDF"], "W 9.pdf", { type: "application/pdf" }), new File(["x"], "sheet.xlsx")]));
    await waitFor(() => expect(actions.saveResourceAction).toHaveBeenCalledTimes(2));
    const [pathname, sent, options] = upload.mock.calls[0];
    expect(pathname).toMatch(PATH);
    expect(pathname.endsWith("/W-9.pdf")).toBe(true);
    expect(sent.name).toBe("W 9.pdf");
    expect(options).toMatchObject({ access: "private", handleUploadUrl: "/admin/resources/upload", multipart: true });
    expect(actions.saveResourceAction).toHaveBeenCalledWith({ pathname, name: "W 9.pdf", category: "Licenses" });
    expect(await screen.findAllByText("Saved")).toHaveLength(2);
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses a file over 200 MB without uploading it", async () => {
    render(<ResourceUploader categories={[]} />);
    const big = new File(["x"], "huge.pdf");
    Object.defineProperty(big, "size", { value: 200 * 1024 * 1024 + 1 });
    await act(async () => pick([big]));
    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByText("Files must be 200 MB or smaller.")).toBeInTheDocument();
  });

  it("shows each file's own failure", async () => {
    upload.mockRejectedValueOnce(new Error("network"));
    render(<ResourceUploader categories={[]} />);
    await act(async () => pick([new File(["x"], "a.pdf")]));
    expect(await screen.findByText("Upload failed. Check your connection and try again.")).toBeInTheDocument();
    expect(actions.saveResourceAction).not.toHaveBeenCalled();
  });

  it("starts with the General category, and needs one", async () => {
    render(<ResourceUploader categories={[]} />);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("General");
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: " " } });
    await act(async () => pick([new File(["x"], "a.pdf")]));
    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Pick or type a category (up to 60 characters).");
  });
});

describe("Resources page", () => {
  it("is for owners, and shows the uploader and the list", async () => {
    store.listResources.mockResolvedValue(LIST);
    store.listCategories.mockResolvedValue(["Licenses", "Spec books"]);
    render(await ResourcesPage());
    expect(requireAdmin).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Resources");
    expect(screen.getByLabelText("Choose files")).toBeInTheDocument();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label") ?? within(r).getByRole("heading").textContent)).toEqual([
      "Upload files", "Licenses (2)", "Spec books (1)",
    ]);
  });
});

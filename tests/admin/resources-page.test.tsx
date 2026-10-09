import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListedResource } from "@/lib/admin/resource-rules";

const actions = {
  saveResourceAction: vi.fn(), renameResourceAction: vi.fn(), recategorizeResourceAction: vi.fn(), deleteResourceAction: vi.fn(),
  addCategoryAction: vi.fn(), renameCategoryAction: vi.fn(), deleteCategoryAction: vi.fn(),
};
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
const { CategoryManager } = await import("@/app/admin/resources/CategoryManager");
const { default: ResourcesPage } = await import("@/app/admin/resources/page");

const file = (id: string, name: string, category: string, sizeBytes = 1536 * 1024, taskCount = 0): ListedResource => ({
  id, name, category, contentType: "application/pdf", sizeBytes, uploadedBy: "joshua.whirley@example.com", createdAt: new Date("2026-10-02T17:00:00Z"), taskCount,
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

  it("shows a rename that throws on the row, not as a crash", async () => {
    actions.renameResourceAction.mockRejectedValue(new Error("db down"));
    render(<ResourceList resources={[LIST[0]]} categories={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename W-9.pdf" }));
    expect(screen.getByRole("textbox", { name: "New name" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save. Try again.");
  });

  it("deletes only after a second, inline confirmation", async () => {
    render(<ResourceList resources={[LIST[0]]} categories={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete W-9.pdf" }));
    expect(actions.deleteResourceAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete W-9.pdf" }));
    expect(screen.getByRole("button", { name: "Yes, delete" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(actions.deleteResourceAction).toHaveBeenCalledWith("a"));
  });

  it("warns before deleting a file tasks link to", () => {
    render(<ResourceList resources={[file("a", "W-9.pdf", "Licenses", 1024, 2), file("b", "COI.pdf", "Licenses", 1024, 1)]} categories={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete W-9.pdf" }));
    expect(screen.getByText("Delete W-9.pdf? It's attached to 2 tasks and will be removed from them. This can't be undone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete COI.pdf" }));
    expect(screen.getByText("Delete COI.pdf? It's attached to 1 task and will be removed from it. This can't be undone.")).toBeInTheDocument();
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

  it("refuses an empty file without uploading it", async () => {
    render(<ResourceUploader categories={[]} />);
    await act(async () => pick([new File([], "empty.pdf")]));
    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByText("That file is empty.")).toBeInTheDocument();
  });

  it("a save that throws shows on its own file, and the others still finish and refresh", async () => {
    actions.saveResourceAction.mockRejectedValueOnce(new Error("server down")).mockResolvedValueOnce({ ok: true });
    render(<ResourceUploader categories={[]} />);
    await act(async () => pick([new File(["x"], "a.pdf"), new File(["y"], "b.pdf")]));
    expect(await screen.findByText("The file couldn't be saved. Try again.")).toBeInTheDocument();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("files under the default, not a picked category that has since been deleted", async () => {
    const { rerender } = render(<ResourceUploader categories={["Licenses", "Tax", "Uncategorized"]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Tax" } });
    rerender(<ResourceUploader categories={["Licenses", "Uncategorized"]} />);
    await act(async () => pick([new File(["x"], "a.pdf")]));
    await waitFor(() => expect(actions.saveResourceAction).toHaveBeenCalledWith(expect.objectContaining({ category: "Licenses" })));
  });

  it("announces each file's progress and result", async () => {
    render(<ResourceUploader categories={[]} />);
    await act(async () => pick([new File(["x"], "a.pdf")]));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Saved").closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });

  it("shows each file's own failure", async () => {
    upload.mockRejectedValueOnce(new Error("network"));
    render(<ResourceUploader categories={[]} />);
    await act(async () => pick([new File(["x"], "a.pdf")]));
    expect(await screen.findByText("Upload failed. Check your connection and try again.")).toBeInTheDocument();
    expect(actions.saveResourceAction).not.toHaveBeenCalled();
  });

  it("picks from the categories only, starting on General when there is one", () => {
    const { unmount } = render(<ResourceUploader categories={["General", "Licenses", "Uncategorized"]} />);
    const select = screen.getByRole("combobox", { name: "Category" });
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveValue("General");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["General", "Licenses", "Uncategorized"]);
    unmount();
    render(<ResourceUploader categories={["Licenses", "Uncategorized"]} />);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("Licenses");
  });
});

describe("CategoryManager", () => {
  const CATS = [{ name: "Tax", fileCount: 0 }, { name: "Licenses", fileCount: 3 }, { name: "Uncategorized", fileCount: 0 }];
  const names = () => within(screen.getByRole("list", { name: "Categories" })).getAllByRole("listitem").map((li) => li.firstChild?.firstChild?.textContent);

  it("lists the categories A–Z with their file counts, hiding an empty Uncategorized", () => {
    render(<CategoryManager categories={CATS} />);
    expect(names()).toEqual(["Licenses", "Tax"]);
    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.getByText("0 files")).toBeInTheDocument();
  });

  it("adds a category and clears the field, or shows why not", async () => {
    render(<CategoryManager categories={CATS} />);
    fireEvent.change(screen.getByRole("textbox", { name: "New category" }), { target: { value: "Warranty" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    await waitFor(() => expect(actions.addCategoryAction).toHaveBeenCalledWith("Warranty"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "New category" })).toHaveValue(""));
    actions.addCategoryAction.mockResolvedValue({ error: "A category named Tax already exists." });
    fireEvent.change(screen.getByRole("textbox", { name: "New category" }), { target: { value: "Tax" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A category named Tax already exists.");
    expect(screen.getByRole("textbox", { name: "New category" })).toHaveValue("Tax");
  });

  it("renames a category", async () => {
    render(<CategoryManager categories={CATS} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename category Tax" }));
    expect(screen.getByRole("textbox", { name: "New name" })).toHaveValue("Tax");
    fireEvent.change(screen.getByRole("textbox", { name: "New name" }), { target: { value: "Taxes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(actions.renameCategoryAction).toHaveBeenCalledWith("Tax", "Taxes"));
  });

  it("deletes only after a confirmation that says where the files go", async () => {
    render(<CategoryManager categories={CATS} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete category Licenses" }));
    expect(screen.getByText("Delete Licenses? Its 3 files move to Uncategorized.")).toBeInTheDocument();
    expect(actions.deleteCategoryAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(actions.deleteCategoryAction).toHaveBeenCalledWith("Licenses"));
  });

  it("an empty category's confirmation mentions no files", () => {
    render(<CategoryManager categories={CATS} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete category Tax" }));
    expect(screen.getByText("Delete Tax?")).toBeInTheDocument();
  });

  it("shows Uncategorized once it holds files, with no rename or delete", () => {
    render(<CategoryManager categories={[{ name: "Uncategorized", fileCount: 2 }]} />);
    expect(names()).toEqual(["Uncategorized"]);
    expect(screen.queryByRole("button", { name: /category Uncategorized/ })).toBeNull();
  });
});

describe("Resources page", () => {
  it("is for owners, and shows the uploader and the list", async () => {
    store.listResources.mockResolvedValue(LIST);
    store.listCategories.mockResolvedValue([
      { name: "Licenses", fileCount: 2 }, { name: "Spec books", fileCount: 1 }, { name: "Tax", fileCount: 0 }, { name: "Uncategorized", fileCount: 0 },
    ]);
    render(await ResourcesPage());
    expect(requireAdmin).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Resources");
    expect(screen.getByLabelText("Choose files")).toBeInTheDocument();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label") ?? within(r).getByRole("heading").textContent)).toEqual([
      "Upload files", "Categories", "Licenses (2)", "Spec books (1)", "Tax (0)",
    ]);
    expect(within(screen.getByRole("region", { name: "Tax (0)" })).getByText("No files yet.")).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Category" })).getAllByRole("option").map((o) => o.textContent))
      .toEqual(["Licenses", "Spec books", "Tax", "Uncategorized"]);
  });
});

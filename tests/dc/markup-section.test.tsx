import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveMarkupAction = vi.fn();
vi.mock("@/app/admin/settings/actions", () => ({ saveMarkupAction }));
const { MarkupSection } = await import("@/app/admin/settings/MarkupSection");

beforeEach(() => saveMarkupAction.mockReset());

const rowFor = (collection: string) => screen.getByLabelText(`${collection} % of MSRP`).closest("form")!;

describe("markup section", () => {
  it("is headed markup-heading, so other pages can link to it", () => {
    render(<MarkupSection collections={[]} rules={{}} />);
    const heading = screen.getByRole("heading", { name: "Markup by product line" });
    expect(heading).toHaveAttribute("id", "markup-heading");
    expect(screen.getByRole("region", { name: "Markup by product line" })).toBeInTheDocument();
  });

  it("says when no quote has arrived and no line has been added", () => {
    render(<MarkupSection collections={[]} rules={{}} />);
    expect(screen.getByText("No product lines yet. Add one below, or they appear once a Direct Connect quote uses them.")).toBeInTheDocument();
  });

  it("lists each line with its saved % and what a $655 MSRP sells for, from the shared pricing math", () => {
    render(<MarkupSection collections={["Duette", "Pirouette", "Silhouette"]} rules={{ Duette: 60, Silhouette: 57.3 }} />);
    expect(screen.getByLabelText("Duette % of MSRP")).toHaveValue("60");
    expect(within(rowFor("Duette")).getByText("A $655 MSRP sells for $393.")).toBeInTheDocument();
    // round-half-up of 375.315: repeating the arithmetic inline would be easy to get wrong here.
    expect(within(rowFor("Silhouette")).getByText("A $655 MSRP sells for $375.32.")).toBeInTheDocument();
    expect(screen.getByLabelText("Pirouette % of MSRP")).toHaveValue("");
    expect(within(rowFor("Pirouette")).getByText("Not set. Quotes with this product can't be sent yet.")).toBeInTheDocument();
  });

  it("sends the row's own product line name with the typed %", async () => {
    saveMarkupAction.mockResolvedValue({ ok: true });
    render(<MarkupSection collections={["Duette", "Pirouette"]} rules={{}} />);
    fireEvent.change(screen.getByLabelText("Pirouette % of MSRP"), { target: { value: "58" } });
    fireEvent.click(within(rowFor("Pirouette")).getByRole("button", { name: "Save" }));
    expect(await within(rowFor("Pirouette")).findByRole("status")).toHaveTextContent("Saved.");
    const data = saveMarkupAction.mock.calls[0][1] as FormData;
    expect(data.get("collection")).toBe("Pirouette");
    expect(data.get("pct")).toBe("58");
    expect(data.get("mode")).toBeNull();
  });

  it("shows the problem on the row that failed", async () => {
    saveMarkupAction.mockResolvedValue({ error: "Enter a percentage like 60 or 57.5" });
    render(<MarkupSection collections={["Duette"]} rules={{ Duette: 60 }} />);
    fireEvent.click(within(rowFor("Duette")).getByRole("button", { name: "Save" }));
    expect(await within(rowFor("Duette")).findByRole("alert")).toHaveTextContent("Enter a percentage like 60 or 57.5");
  });

  describe("adding a product line", () => {
    it("explains the name must match Direct Connect's Collection", () => {
      render(<MarkupSection collections={[]} rules={{}} />);
      const add = screen.getByRole("form", { name: "Add a product line" });
      expect(add).toHaveTextContent(
        "Type it exactly as Direct Connect's \"Collection\" shows it, for example Alta Honeycomb Shades. Capital letters don't matter.",
      );
    });

    it("sends the typed name and % in add mode, and shows the problem when it fails", async () => {
      saveMarkupAction.mockResolvedValueOnce({ error: "Enter the product line name" }).mockResolvedValueOnce({ ok: true });
      render(<MarkupSection collections={[]} rules={{}} />);
      const add = screen.getByRole("form", { name: "Add a product line" });
      fireEvent.click(within(add).getByRole("button", { name: "Add product line" }));
      expect(await within(add).findByRole("alert")).toHaveTextContent("Enter the product line name");

      fireEvent.change(within(add).getByLabelText("Product line"), { target: { value: "Alta Honeycomb Shades" } });
      fireEvent.change(within(add).getByLabelText("% of MSRP"), { target: { value: "62.5" } });
      fireEvent.click(within(add).getByRole("button", { name: "Add product line" }));
      expect(await within(add).findByRole("status")).toHaveTextContent("Added.");
      const data = saveMarkupAction.mock.calls[1][1] as FormData;
      expect(data.get("mode")).toBe("add");
      expect(data.get("collection")).toBe("Alta Honeycomb Shades");
      expect(data.get("pct")).toBe("62.5");
    });

    it("says which rule it updated when the name matched an existing one", async () => {
      saveMarkupAction.mockResolvedValueOnce({ ok: true, updated: "Duette" });
      render(<MarkupSection collections={["Duette"]} rules={{ Duette: 60 }} />);
      const add = screen.getByRole("form", { name: "Add a product line" });
      fireEvent.change(within(add).getByLabelText("Product line"), { target: { value: "duette" } });
      fireEvent.change(within(add).getByLabelText("% of MSRP"), { target: { value: "62" } });
      fireEvent.click(within(add).getByRole("button", { name: "Add product line" }));
      const status = await within(add).findByRole("status");
      expect(status).toHaveTextContent("Updated Duette.");
      expect(status).not.toHaveTextContent("Added.");
    });
  });
});

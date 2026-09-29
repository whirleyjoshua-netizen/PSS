import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocEditor } from "@/app/admin/documents/DocEditor";
import { TERMS_FIELDS } from "@/lib/docs/fields";

afterEach(() => vi.restoreAllMocks());

const inForm = (ui: ReactNode) => render(<form><input name="name" defaultValue="Service agreement" />{ui}</form>);

describe("DocEditor", () => {
  it("formats the caret's line and shows the live preview", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="Scope" mode="template" kind="service_agreement" titleField="name" />);
    const area = screen.getByLabelText("Text") as HTMLTextAreaElement;
    area.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole("button", { name: "Heading" }));
    expect(area.value).toBe("## Scope");
    expect(within(screen.getByRole("region", { name: "Preview" })).getByRole("heading", { name: "Scope" })).toBeInTheDocument();
  });
  it("bolds the selection and reports each change", () => {
    const onChange = vi.fn();
    inForm(<DocEditor name="body" label="Text" defaultValue="pay now" mode="document" titleField="title" onChange={onChange} />);
    const area = screen.getByLabelText("Text") as HTMLTextAreaElement;
    area.setSelectionRange(4, 7);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(area.value).toBe("pay **now**");
    expect(onChange).toHaveBeenLastCalledWith("pay **now**");
  });
  it("offers only the fields the kind allows and inserts the one chosen", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="" mode="template" kind="terms" titleField="name" />);
    const select = screen.getByLabelText("Insert field") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value).filter(Boolean)).toEqual([...TERMS_FIELDS]);
    fireEvent.change(select, { target: { value: "client_name" } });
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("{{client_name}}");
  });
  it("flags a field the template cannot use, in the words saving uses", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="{{deposit}} {{nope}}" mode="template" kind="terms" titleField="name" />);
    expect(within(screen.getByRole("alert")).getAllByRole("listitem").map((li) => li.textContent))
      .toEqual(["{{deposit}} can't be used in Contract terms.", "Unknown field {{nope}}."]);
  });
  it("flags an allowed field split across lines, which saving refuses", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue={"Hi {{client_name\n}}"} mode="template" kind="terms" titleField="name" />);
    expect(within(screen.getByRole("alert")).getAllByRole("listitem").map((li) => li.textContent))
      .toEqual(["Field {{client_name}} must be on one line."]);
  });
  it("flags a key split across lines as one-line, not unknown", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue={"Hi {{client\n_name}}"} mode="template" kind="terms" titleField="name" />);
    expect(within(screen.getByRole("alert")).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Field {{client _name}} must be on one line.");
  });
  it("shows no alert for a template whose fields are all allowed", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="Hi {{client_name}}" mode="template" kind="terms" titleField="name" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("in a document: no field menu, and every remaining marker is named", () => {
    inForm(<DocEditor name="body" label="Text" defaultValue="Deposit {{deposit}}" mode="document" titleField="title" />);
    expect(screen.queryByLabelText("Insert field")).toBeNull();
    expect(screen.getByText("Replace before sending: {{deposit}}")).toBeInTheDocument();
  });
  it("Preview PDF posts the title, text and extras to the preview route in a new tab", () => {
    const posted: { action: string; target: string; fields: Record<string, string> }[] = [];
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
      posted.push({ action: this.getAttribute("action")!, target: this.target,
        fields: Object.fromEntries([...new FormData(this).entries()].map(([k, v]) => [k, String(v)])) });
    });
    inForm(<DocEditor name="body" label="Text" defaultValue="## Hi" mode="template" kind="service_agreement" titleField="name" previewExtras={{ response: "sign" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
    expect(posted).toEqual([{ action: "/admin/documents/preview", target: "_blank", fields: { response: "sign", title: "Service agreement", body: "## Hi" } }]);
  });
});

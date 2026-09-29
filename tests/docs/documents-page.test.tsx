import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "o@x.com" })) }));
const listTemplates = vi.fn();
vi.mock("@/lib/docs/templates", () => ({ listTemplates }));
const getDcSettings = vi.fn();
vi.mock("@/lib/dc/store", () => ({ getDcSettings }));
vi.mock("@/app/admin/documents/actions", () => ({
  createTemplateAction: vi.fn(async () => ({})), saveTemplateAction: vi.fn(async () => ({})),
  archiveTemplateAction: vi.fn(), startStarterTermsAction: vi.fn(),
}));

const { default: DocumentsPage } = await import("@/app/admin/documents/page");
const { TemplateForm } = await import("@/app/admin/documents/TemplateForm");
const actions = vi.mocked(await import("@/app/admin/documents/actions"));

const template = (over: Record<string, unknown>) => ({ id: "t1", name: "Service agreement", kind: "service_agreement", response: "acknowledge",
  body: "x", archivedAt: null, createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date("2026-09-28T18:00:00Z"), ...over });

beforeEach(() => {
  listTemplates.mockReset().mockResolvedValue([]);
  getDcSettings.mockReset().mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
});

describe("Documents page", () => {
  it("groups live templates as Contract terms, Client documents and Portal guides", async () => {
    listTemplates.mockResolvedValue([template({}), template({ id: "t2", name: "Install prep", kind: "guide_install", response: "view" })]);
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { level: 1, name: "Documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New template" })).toHaveAttribute("href", "/admin/documents/new");
    expect(within(screen.getByRole("region", { name: "Client documents" })).getByRole("link", { name: "Service agreement" }))
      .toHaveAttribute("href", "/admin/documents/t1");
    expect(within(screen.getByRole("region", { name: "Portal guides" })).getByRole("link", { name: "Install prep" })).toBeInTheDocument();
  });
  it("offers the starter terms only while there are no terms", async () => {
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    expect(within(screen.getByRole("region", { name: "Contract terms" }))
      .getByRole("button", { name: "Start from the Premier Shade starter terms" })).toBeInTheDocument();
  });
  it("says contracts use the uploaded PDF when there is no terms template but an upload, and still offers the starter", async () => {
    getDcSettings.mockResolvedValue({ termsPathname: "settings/terms.pdf", termsUpdatedAt: null, lastPolledAt: null });
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    const terms = within(screen.getByRole("region", { name: "Contract terms" }));
    expect(terms.getByText("Contracts use your uploaded PDF. Creating terms here replaces it in every contract from then on.")).toBeInTheDocument();
    expect(terms.queryByText(/No contract terms yet/)).toBeNull();
    expect(terms.getByRole("button", { name: "Start from the Premier Shade starter terms" })).toBeInTheDocument();
  });
  it("says contracts can't be sent with neither a terms template nor an upload", async () => {
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    expect(within(screen.getByRole("region", { name: "Contract terms" }))
      .getByText("No contract terms yet. Contracts can't be sent until you add them.")).toBeInTheDocument();
  });
  it("hides the starter once terms exist", async () => {
    listTemplates.mockResolvedValue([template({ kind: "terms", name: "Contract terms", response: "view" })]);
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("button", { name: /starter terms/ })).toBeNull();
  });
});

describe("TemplateForm", () => {
  it("fixes the response to View for terms and offers only the terms fields", () => {
    render(<TemplateForm template={null} />);
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "terms" } });
    expect(screen.getByLabelText("Client response")).toBeDisabled();
    expect(screen.getByLabelText("Client response")).toHaveValue("view");
    const fields = [...(screen.getByLabelText("Insert field") as HTMLSelectElement).options].map((o) => o.value).filter(Boolean);
    expect(fields).toEqual(["client_name", "project_no", "today", "company_name", "company_phone", "company_email"]);
    expect(screen.getByRole("button", { name: "Create template" })).toBeInTheDocument();
  });
  it("offers no field at all for a guide", () => {
    render(<TemplateForm template={null} />);
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "guide_care" } });
    expect(screen.queryByLabelText("Insert field")).toBeNull();
  });
  it("edits an existing template without changing its kind", () => {
    render(<TemplateForm template={{ id: "t1", name: "SA", kind: "service_agreement", response: "sign", body: "## A" }} />);
    expect(screen.queryByLabelText("Kind")).toBeNull();
    expect(screen.getByText("Service agreement")).toBeInTheDocument();
    expect(screen.getByLabelText("Client response")).toHaveValue("sign");
    expect(screen.getByLabelText("Text")).toHaveValue("## A");
    expect(screen.getByRole("button", { name: "Save template" })).toBeInTheDocument();
  });
});

// React 19 resets a form after its action finishes. Every control must still show what the owner
// chose, or the next save silently posts the mount-time value.
describe("TemplateForm keeps the owner's values after the server answers", () => {
  const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
  const submit = async (name: string) => {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
  };
  const editForm = () => {
    render(<TemplateForm template={{ id: "t1", name: "SA", kind: "service_agreement", response: "sign", body: "## A" }} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Padded name  " } });
    fireEvent.change(screen.getByLabelText("Client response"), { target: { value: "acknowledge" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "typed {{client_name}}" } });
  };

  it("keeps name, response and text when a save is refused", async () => {
    actions.saveTemplateAction.mockResolvedValueOnce({ errors: ["This template was archived. Reload the page."] });
    editForm();
    await submit("Save template");
    await screen.findByRole("list", { name: "Template problems" });
    const posted = actions.saveTemplateAction.mock.calls.at(-1)![1];
    expect(posted.get("response")).toBe("acknowledge");
    expect(value("Name")).toBe("  Padded name  ");
    expect(value("Client response")).toBe("acknowledge");
    expect(value("Text")).toBe("typed {{client_name}}");
    expect(screen.getByText("Service agreement")).toBeInTheDocument();
  });

  it("shows what was saved, with the name trimmed as the store keeps it, and clears Saved. on the next edit", async () => {
    actions.saveTemplateAction.mockResolvedValueOnce({ saved: true });
    editForm();
    await submit("Save template");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(value("Name")).toBe("Padded name");
    expect(value("Client response")).toBe("acknowledge");
    expect(value("Text")).toBe("typed {{client_name}}");
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "typed again" } });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps kind, name, a view-only response and text when a create is refused", async () => {
    actions.createTemplateAction.mockResolvedValueOnce({ errors: ["There is already a live Contract terms template. Edit that one instead."] });
    render(<TemplateForm template={null} />);
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "terms" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My terms" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "typed body" } });
    await submit("Create template");
    await screen.findByRole("list", { name: "Template problems" });
    expect(value("Kind")).toBe("terms");
    expect(value("Name")).toBe("My terms");
    expect(value("Client response")).toBe("view");
    expect(screen.getByLabelText("Client response")).toBeDisabled();
    expect(value("Text")).toBe("typed body");
  });
});

describe("starter terms button", () => {
  it("is disabled while the starter terms are being created", async () => {
    actions.startStarterTermsAction.mockImplementationOnce(() => new Promise(() => {}));
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
    const button = screen.getByRole("button", { name: "Start from the Premier Shade starter terms" });
    expect(button).toBeEnabled();
    await act(async () => { fireEvent.click(button); });
    expect(button).toBeDisabled();
    expect(actions.startStarterTermsAction).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "o@x.com" })) }));
const listTemplates = vi.fn();
vi.mock("@/lib/docs/templates", () => ({ listTemplates }));
vi.mock("@/app/admin/documents/actions", () => ({
  createTemplateAction: vi.fn(async () => ({})), saveTemplateAction: vi.fn(async () => ({})),
  archiveTemplateAction: vi.fn(), startStarterTermsAction: vi.fn(),
}));

const { default: DocumentsPage } = await import("@/app/admin/documents/page");
const { TemplateForm } = await import("@/app/admin/documents/TemplateForm");

const template = (over: Record<string, unknown>) => ({ id: "t1", name: "Service agreement", kind: "service_agreement", response: "acknowledge",
  body: "x", archivedAt: null, createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date("2026-09-28T18:00:00Z"), ...over });

beforeEach(() => listTemplates.mockReset().mockResolvedValue([]));

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

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "o@x.com" })) }));
const getTemplate = vi.fn();
vi.mock("@/lib/docs/templates", () => ({ getTemplate }));
const getDcSettings = vi.fn();
vi.mock("@/lib/dc/store", () => ({ getDcSettings }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/app/admin/documents/actions", () => ({
  createTemplateAction: vi.fn(async () => ({})), saveTemplateAction: vi.fn(async () => ({})), archiveTemplateAction: vi.fn(),
}));

const { default: TemplatePage } = await import("@/app/admin/documents/[id]/page");

const ID = "11111111-1111-4111-8111-111111111111";
const template = (over: Record<string, unknown>) => ({ id: ID, name: "Contract terms", kind: "terms", response: "view", body: "## T",
  archivedAt: null, createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: new Date(), ...over });
const page = async () => render(await TemplatePage({ params: Promise.resolve({ id: ID }) }));

beforeEach(() => {
  getTemplate.mockReset().mockResolvedValue(template({}));
  getDcSettings.mockReset().mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
});

describe("archiving a template", () => {
  it("warns that contracts can't be sent once the terms are archived with no uploaded PDF", async () => {
    await page();
    expect(screen.getByText("Archiving hides these terms. Contracts can't be sent until you add new terms.")).toBeInTheDocument();
  });
  it("says contracts fall back to the uploaded PDF when there is one", async () => {
    getDcSettings.mockResolvedValue({ termsPathname: "settings/terms.pdf", termsUpdatedAt: null, lastPolledAt: null });
    await page();
    expect(screen.getByText("Archiving hides these terms. Contracts will use your uploaded PDF terms instead.")).toBeInTheDocument();
  });
  it("keeps the plain message for any other kind", async () => {
    getTemplate.mockResolvedValue(template({ name: "SA", kind: "service_agreement", response: "sign" }));
    await page();
    expect(screen.getByText("Archiving hides this template. Documents already made from it keep their text.")).toBeInTheDocument();
    expect(getDcSettings).not.toHaveBeenCalled();
  });
});

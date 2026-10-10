import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { default: AgentPage } = await import("@/app/admin/agents/[slug]/page");
const { default: ItemPage } = await import("@/app/admin/agents/[slug]/[itemId]/page");
const openAgent = (slug: string, search: Record<string, string | string[]> = {}) =>
  AgentPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(search) });
const openItem = (slug: string, itemId: string) => ItemPage({ params: Promise.resolve({ slug, itemId }) });

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  redirect.mockClear();
});

describe("old agent routes", () => {
  it("/admin/agents/[slug] opens that agent on the Agents page, keeping the report type", async () => {
    await expect(openAgent("tara")).rejects.toThrow("NEXT_REDIRECT /admin/agents?agent=tara");
    await expect(openAgent("tara", { type: "weekly" })).rejects.toThrow("NEXT_REDIRECT /admin/agents?agent=tara&type=weekly");
    // Only one type is passed on; a repeated one is dropped.
    await expect(openAgent("tara", { type: ["a", "b"] })).rejects.toThrow(/^NEXT_REDIRECT \/admin\/agents\?agent=tara$/);
  });

  it("/admin/agents/[slug]/[itemId] opens the item in the reading pane", async () => {
    await expect(openItem("tara", ID)).rejects.toThrow(`NEXT_REDIRECT /admin/agents?agent=tara&item=${ID}`);
  });

  it("encodes whatever is in the path", async () => {
    await expect(openItem("a&b", "x y")).rejects.toThrow("NEXT_REDIRECT /admin/agents?agent=a%26b&item=x+y");
  });

  it("checks the admin before redirecting", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT /admin/login"));
    await expect(openAgent("tara")).rejects.toThrow("/admin/login");
    await expect(openItem("tara", ID)).rejects.toThrow("/admin/login");
    expect(redirect).not.toHaveBeenCalled();
  });
});

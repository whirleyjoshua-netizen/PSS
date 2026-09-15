import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const addContact = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ addContact }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { logContactAction } = await import("@/app/admin/jobs/contact-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  addContact.mockReset().mockResolvedValue(true);
});

describe("logContactAction", () => {
  it("checks the session before reading input", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(logContactAction(JOB, {}, form([["methods", "called"]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(addContact).not.toHaveBeenCalled();
  });
  it("saves the contact line as the owner", async () => {
    expect(await logContactAction(JOB, {}, form([["methods", "called"], ["methods", "texted"], ["note", "left details"]])))
      .toEqual({ ok: true });
    expect(addContact).toHaveBeenCalledWith(JOB, "Contacted · Called, Texted — left details", "owner@example.com");
  });
  it("keeps what was typed when no method is picked", async () => {
    const state = await logContactAction(JOB, {}, form([["note", "hello"]]));
    expect(state).toEqual({ error: "Pick how you reached them", values: { note: "hello" } });
    expect(addContact).not.toHaveBeenCalled();
  });
  it("reports a job that no longer exists", async () => {
    addContact.mockResolvedValue(false);
    expect(await logContactAction(JOB, {}, form([["methods", "email"]]))).toEqual({ error: "That job no longer exists." });
  });
});

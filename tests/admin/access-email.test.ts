import { describe, it, expect, vi, beforeEach } from "vitest";
import { business } from "@/content/business";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { sendAccessEmail, adminSignInUrl } = await import("@/lib/admin/access-email");

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test/");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("access email", () => {
  it("builds the sign-in page link on the configured origin", () => {
    expect(adminSignInUrl()).toBe("https://pss.test/admin/sign-in");
    vi.stubEnv("ADMIN_BASE_URL", "");
    expect(adminSignInUrl()).toBe(`${business.domain.replace(/\/+$/, "")}/admin/sign-in`);
  });

  it("tells them who added them and where to sign in", async () => {
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(true);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("alia@x.com");
    expect(message.subject).toBe("You have access to the PSS admin");
    expect(message.text).toContain("owner@x.com");
    expect(message.text).toContain("https://pss.test/admin/sign-in");
    expect(message.text).toContain("Sign in with this email address.");
  });

  it("returns false without sending when email is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns false when Resend rejects or throws", async () => {
    send.mockResolvedValueOnce({ error: { message: "bad" } });
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(false);
    send.mockRejectedValueOnce(new Error("network"));
    expect(await sendAccessEmail("alia@x.com", "owner@x.com")).toBe(false);
  });
});

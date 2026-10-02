import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const removeFaceIdDevice = vi.fn();
vi.mock("@/app/admin/passkey-actions", () => ({
  removeFaceIdDevice,
  beginFaceIdSetup: vi.fn(async () => ({ challenge: "abc" })),
  completeFaceIdSetup: vi.fn(),
}));
// The real unstable_rethrow, not the shared setup's router-only stub.
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()) }));
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => true,
  platformAuthenticatorIsAvailable: async () => true,
  startRegistration: vi.fn(),
}));

const { FaceIdSection } = await import("@/app/admin/settings/FaceIdSection");

const devices = [
  { id: "cred-1", label: "iPhone", createdAt: new Date("2026-10-01T18:00:00Z"), lastUsedAt: new Date("2026-10-03T18:00:00Z") },
  { id: "cred-2", label: "Mac", createdAt: new Date("2026-10-02T18:00:00Z"), lastUsedAt: null },
];

describe("FaceIdSection", () => {
  it("lists each device with when it was added and last used, and a Remove button", async () => {
    render(<FaceIdSection devices={devices} />);
    expect(screen.getByRole("heading", { name: "Face ID sign-in" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("iPhone");
    expect(items[0]).toHaveTextContent("Added Thu, Oct 1, 2026");
    expect(items[0]).toHaveTextContent("last used Sat, Oct 3, 2026");
    expect(items[1]).toHaveTextContent("Mac");
    expect(items[1]).toHaveTextContent("never used");
    expect(within(items[0]).getByRole("button", { name: "Remove iPhone added Thu, Oct 1, 2026" })).toHaveAttribute("type", "submit");
    expect(await screen.findByRole("button", { name: "Turn on Face ID for this device" })).toBeInTheDocument();
    // Its options are fetched before the tap, so the button comes on by itself.
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn on Face ID for this device" })).toBeEnabled());
  });

  it("says when no device is set up", () => {
    render(<FaceIdSection devices={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText(/no devices yet/i)).toBeInTheDocument();
  });
});

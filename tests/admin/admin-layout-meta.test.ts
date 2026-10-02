import { describe, it, expect, vi } from "vitest";

// app/layout.tsx calls next/font/google at import time; under vitest those exports are not callable.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "font-google", variable: "--font-google", style: { fontFamily: "google" } });
  return { Jost: font, Source_Serif_4: font };
});
vi.mock("@/lib/admin/session", () => ({ getAdmin: vi.fn(async () => null) }));

const admin = await import("@/app/admin/layout");
const root = await import("@/app/layout");
const site = await import("@/app/(site)/layout");

describe("admin layout metadata", () => {
  it("links the PSS Ops manifest and the iOS home-screen tags", () => {
    expect(admin.metadata).toEqual({
      title: "PSS Jobs",
      robots: { index: false, follow: false },
      manifest: "/ops.webmanifest",
      appleWebApp: { capable: true, title: "PSS Ops", statusBarStyle: "black-translucent" },
      icons: { icon: "/icon.svg", apple: "/ops/icon-180.png" },
      // Next writes only mobile-web-app-capable for appleWebApp.capable; older iOS reads this one.
      other: { "apple-mobile-web-app-capable": "yes" },
    });
  });

  it("draws under the notch in #1E1E1E", () => {
    expect(admin.viewport).toEqual({ viewportFit: "cover", themeColor: "#1E1E1E" });
  });

  it("leaves the public site uninstallable as PSS Ops", () => {
    expect(root.metadata).not.toHaveProperty("manifest");
    expect(root.metadata).not.toHaveProperty("appleWebApp");
  });

  it("gives the public site's own layout no manifest or iOS app tags either", () => {
    const metadata = (site as { metadata?: object }).metadata ?? {};
    expect(metadata).not.toHaveProperty("manifest");
    expect(metadata).not.toHaveProperty("appleWebApp");
    expect(JSON.stringify(metadata)).not.toContain("apple-mobile-web-app");
  });
});

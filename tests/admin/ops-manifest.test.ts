import { describe, it, expect } from "vitest";
import { GET } from "@/app/ops.webmanifest/route";

describe("/ops.webmanifest", () => {
  it("installs the admin as PSS Ops, scoped to /admin", async () => {
    const response = GET();
    expect(response.headers.get("Content-Type")).toBe("application/manifest+json");
    expect(await response.json()).toEqual({
      id: "/admin",
      name: "PSS Ops",
      short_name: "PSS Ops",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      background_color: "#1E1E1E",
      theme_color: "#1E1E1E",
      icons: [
        { src: "/ops/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/ops/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/ops/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    });
  });

  it("points only at icons that exist in public/", async () => {
    const { existsSync } = await import("node:fs");
    const { icons } = (await GET().json()) as { icons: { src: string }[] };
    for (const { src } of icons) expect(existsSync(`public${src}`), src).toBe(true);
    expect(existsSync("public/ops/icon-180.png")).toBe(true);
  });
});

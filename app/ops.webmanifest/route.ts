/** The PSS Ops home-screen app. Outside /admin so proxy.ts's sign-in redirect never intercepts it. */
export function GET() {
  return Response.json(
    {
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
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}

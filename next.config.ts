import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json in the parent directory
  // otherwise makes Turbopack infer the wrong root.
  turbopack: { root: path.resolve(import.meta.dirname) },
  // A customer's service request carries one photo of up to 10 MB, and the form must work with
  // JavaScript off — so it posts straight to a Server Action rather than through a fetch to a
  // route handler. Action requests are capped at 1 MB by default; 12 MB leaves room for the
  // image plus the rest of the multipart body. The 10 MB limit itself is enforced in code.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // One canonical host. The admin session cookie belongs to the host that set it,
  // and sign-in links and the Outlook webhook use the apex, so www must not serve pages.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.premiershadesolutions.com" }],
        destination: "https://premiershadesolutions.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

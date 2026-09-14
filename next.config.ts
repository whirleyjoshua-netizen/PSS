import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json in the parent directory
  // otherwise makes Turbopack infer the wrong root.
  turbopack: { root: path.resolve(import.meta.dirname) },
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

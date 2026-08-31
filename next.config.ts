import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json in the parent directory
  // otherwise makes Turbopack infer the wrong root.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;

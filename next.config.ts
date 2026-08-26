import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: without it Turbopack walks up and picks up a
  // stray package-lock.json in the user's home directory.
  turbopack: { root: path.resolve(".") },
};

export default nextConfig;

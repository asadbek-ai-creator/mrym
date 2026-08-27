import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: without it Turbopack walks up and picks up a
  // stray package-lock.json in the user's home directory.
  turbopack: { root: path.resolve(".") },

  // Cache Components: lets the reporting queries opt into the data cache with
  // `use cache` + `cacheTag`, so the dashboard serves cached figures and the
  // database is only hit when the bot or the cron actually writes something.
  // In Next 16 this replaces `unstable_cache`, which is deprecated.
  cacheComponents: true,
};

export default nextConfig;

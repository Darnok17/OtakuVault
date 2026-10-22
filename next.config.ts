import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Moodboard saves carry image nodes as compressed data URLs until they move to Blob storage.
    // Keep above MAX_BOARD_CHARS in app/actions/moodboards.ts.
    serverActions: { bodySizeLimit: "8mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

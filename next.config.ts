import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
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

export default async function config(phase: string): Promise<NextConfig> {
  // `next dev` normally runs plain Node (DATABASE_URL, local uploads) and needs no Cloudflare
  // bindings. CF_DEV_BINDINGS=1 exposes wrangler.jsonc's bindings to `next dev` through a local
  // miniflare (getCloudflareContext), e.g. to try STORAGE_DRIVER=r2. Never runs during `next build`,
  // so Vercel and CI builds are unaffected.
  if (phase === PHASE_DEVELOPMENT_SERVER && process.env.CF_DEV_BINDINGS === "1") {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    await initOpenNextCloudflareForDev();
  }
  return nextConfig;
}

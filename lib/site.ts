// Canonical public origins. Safe in client code: NEXT_PUBLIC_* values are inlined at build time.
// Production defaults to the real domain so every production build (Cloudflare or, until cutover,
// Vercel) emits the same canonical URLs without extra build configuration.

const isProd = process.env.NODE_ENV === "production";

// Site origin, no trailing slash: metadataBase, canonical URLs, sitemap, robots.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || (isProd ? "https://otakuvault.app" : "http://localhost:3000")).replace(/\/$/, "");

// Host serving uploaded images from R2 (MEDIA_BASE_URL on the Worker).
export const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_HOST || "img.otakuvault.app";

// Only the real domain is indexable; localhost, previews and staging builds are not.
export const INDEXABLE = SITE_URL === "https://otakuvault.app";

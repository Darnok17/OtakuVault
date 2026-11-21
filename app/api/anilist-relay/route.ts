import { timingSafeEqual } from "node:crypto";

// TEMPORARY AniList relay. AniList's API answers 403 ("manually blocked") to every request from
// Cloudflare Workers, so the Worker sends its AniList GraphQL calls here instead
// (ANILIST_API_URL=https://otaku-vault-gold.vercel.app/api/anilist-relay plus the
// x-relay-secret header, see lib/anilist.ts), and this route, running on Vercel, forwards them.
//
// It does nothing else: POST only, fixed upstream, shared secret required, small bodies only,
// and it only exists on Vercel with ANILIST_RELAY_SECRET set (404 everywhere else, including
// on Cloudflare). Delete it, the env vars and the Vercel project once nothing on Cloudflare calls
// AniList at request time (see docs/cloudflare-migration-guide.md, "AniList relay").

const UPSTREAM = "https://graphql.anilist.co";
const MAX_BODY = 32 * 1024;

export const maxDuration = 15;

const notFound = () => new Response("Not found", { status: 404 });

function authorized(given: string, secret: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.ANILIST_RELAY_SECRET;
  if (process.env.VERCEL !== "1" || !secret) return notFound();
  if (!authorized(request.headers.get("x-relay-secret") ?? "", secret)) {
    return Response.json({ errors: [{ message: "Unauthorized" }] }, { status: 401 });
  }
  const body = await request.text();
  if (body.length === 0 || body.length > MAX_BODY) {
    return Response.json({ errors: [{ message: "Bad request" }] }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return Response.json({ errors: [{ message: "AniList unreachable" }] }, { status: 502 });
  }
  // Pass through status, body and the rate-limit headers lib/anilist.ts reads.
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const h of ["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
